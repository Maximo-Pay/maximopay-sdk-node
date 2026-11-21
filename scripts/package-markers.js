// Marca cada saída com o tipo de módulo, para o Node não depender do
// "type" do package.json raiz.
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(__dirname, '..', 'dist');
fs.writeFileSync(path.join(dist, 'cjs', 'package.json'), '{ "type": "commonjs" }\n');
fs.writeFileSync(path.join(dist, 'esm', 'package.json'), '{ "type": "module" }\n');
