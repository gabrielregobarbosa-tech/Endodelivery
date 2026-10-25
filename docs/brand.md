# Identidade visual do EndoDelivery

O símbolo é um desenho vetorial original de um dente dentro de um prontuário odontológico: prancheta de cantos arredondados, presilha discreta e dente central com duas raízes reconhecíveis. O fundo verde-petróleo e os traços brancos mantêm a leitura em ícones pequenos. O desenho é flat, sem gradientes ou efeitos tridimensionais.

O SVG original foi criado para este repositório. O símbolo da marca não incorpora logotipos, imagens odontológicas nem ícones de terceiros. O nome EndoDelivery é composto em texto com a família de fontes do sistema operacional; a marca não depende de uma fonte externa ou de um serviço de imagens.

## Cores e slogan

| Uso | Cor |
| --- | --- |
| Verde-petróleo principal | `#145E58` |
| Verde-claro complementar | `#B5E1D5` |
| Símbolo e fundo claro | `#FFFFFF` |

O slogan oficial é **“Seu prontuário endodôntico, onde você estiver.”** Ele aparece na apresentação das telas de acesso e na descrição institucional da PWA. O cabeçalho do aplicativo mantém apenas símbolo e nome para evitar repetição.

No tema escuro, o verde-claro identifica ações sobre fundos escuros. Botões usam texto escuro sobre o verde-claro. Os contrastes verificados são 7,58:1 entre branco e verde-petróleo, e 9:1 entre verde-claro e o texto escuro dos botões.

## Arquivos e aplicações

| Arquivo | Aplicação |
| --- | --- |
| `public/brand/mark.svg` | Fonte vetorial principal e símbolo usado pelo componente `BrandMark` |
| `public/icon.svg` | Cópia da fonte principal para favicon e PWA |
| `public/brand/favicon.svg` | Favicon vetorial |
| `public/brand/favicon-16.png` | Favicon 16 × 16 |
| `public/brand/favicon-32.png` | Favicon 32 × 32 |
| `public/brand/apple-touch-icon.png` | Apple Touch Icon 180 × 180, opaco |
| `public/icon-192.png` | Ícone PWA 192 × 192 |
| `public/icon-512.png` | Ícone PWA 512 × 512 |
| `public/brand/maskable.svg` | Variante com margem de segurança para máscaras do sistema |
| `public/icon-maskable-512.png` | Ícone PWA maskable 512 × 512, opaco |
| `public/brand/ios-app-icon-1024.png` | Base opaca 1024 × 1024 para um futuro App Icon no Xcode |

Os ícones 180, maskable 512 e 1024 têm fundo opaco. Os demais PNGs preservam a transparência externa dos cantos arredondados. O ícone nativo 1024 é um recurso de marca preparado para uso futuro; não corresponde à implementação de um aplicativo SwiftUI.

O componente `components/brand.tsx` usa o SVG público principal, acompanhado do nome EndoDelivery. `app/layout.tsx` declara os favicons e o Apple Touch Icon; `app/manifest.ts` declara as variantes PWA. A inspeção visual do símbolo deve confirmar a prancheta e a anatomia simplificada do dente; os testes automatizados verificam integridade, dimensões, transparência e referências dos arquivos.

## Regenerar os PNGs

Com as dependências instaladas, execute na raiz do projeto:

```bash
node --input-type=module - <<'JS'
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile('public/brand/mark.svg');
const maskable = await readFile('public/brand/maskable.svg');
await writeFile('public/icon.svg', source);
await writeFile('public/brand/favicon.svg', source.toString().replace('width="128" height="128"', 'width="32" height="32"'));
for (const [size, file] of [[16, 'public/brand/favicon-16.png'], [32, 'public/brand/favicon-32.png'], [192, 'public/icon-192.png'], [512, 'public/icon-512.png']]) {
  await sharp(source).resize(size, size).png().toFile(file);
}
await sharp(source).resize(180, 180).flatten({ background: '#145E58' }).png().toFile('public/brand/apple-touch-icon.png');
await sharp(maskable).resize(512, 512).flatten({ background: '#145E58' }).png().toFile('public/icon-maskable-512.png');
await sharp(source).resize(1024, 1024).flatten({ background: '#145E58' }).png().toFile('public/brand/ios-app-icon-1024.png');
JS
```

Mantenha a geometria da variante maskable alinhada à fonte principal quando alterar o desenho. Após uma atualização dos ícones, incremente a versão do cache público no service worker para que instalações existentes obtenham os novos arquivos. Execute `node --import tsx --test tests/branding.test.ts` e confira a marca no login, cadastro, cabeçalho e em telas pequenas.
