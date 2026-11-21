// Cobrança Pix + webhook em menos de 20 linhas (sem dependências além do SDK).
// Formatado à mão de propósito: não rode o prettier neste arquivo.
import { createServer } from 'node:http';
import { MaximoPay } from '@maximopay/node';

const mp = new MaximoPay({ appId: process.env.MP_APP_ID, appSecret: process.env.MP_APP_SECRET, baseUrl: process.env.MP_BASE_URL });

const charge = await mp.charges.create({
  amount: 1500, paymentMethod: 'PIX', referenceId: 'pedido-123',
  customer: { name: 'João Silva', document: '12345678909', email: 'joao@email.com' },
});
console.log('Pix copia e cola:', charge.metadata.pixCopiaECola);

createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk)).on('end', () => {
    try {
      const event = mp.webhooks.constructEvent(Buffer.concat(chunks), req.headers, process.env.MP_WEBHOOK_SECRET);
      if (event.type === 'charge.paid') console.log('Pedido pago:', event.data.referenceId);
      res.writeHead(200).end();
    } catch { res.writeHead(400).end(); }
  });
}).listen(process.env.PORT ?? 3000);
