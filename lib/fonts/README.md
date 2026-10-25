# Fontes dos documentos

Os PDFs incorporam subconjuntos de DejaVu Sans regular e bold 2.37, distribuídos com a licença em `LICENSE-DejaVu.txt`. As cópias vêm dos pacotes DejaVu do sistema; nenhuma fonte é baixada durante a emissão de um documento.

Essas fontes preservam a pontuação, diacríticos e caracteres combinantes dos nomes profissionais, inclusive os exemplos em português. A cobertura de glifos também inclui grego, cirílico, hebraico e árabe. Para textos com Han, Kana e Hangul, o gerador carrega sob demanda a fonte TrueType variável `NotoSansKR.ttf`, com peso regular 400. A cópia original, não modificada, vem de `google/fonts`, caminho `ofl/notosanskr/NotoSansKR[wght].ttf`, sob a licença em `LICENSE-Noto-KR.txt`. O subconjunto é produzido em memória pelo HarfBuzz (`subset-font`) e incorporado sem uma segunda redução pelo fontkit, cujo subsetter perde contornos de alguns glifos CJK. O mesmo fallback regular é usado em trechos destacados; documentos latinos não carregam a fonte CJK.

A composição atual não cobre todos os sistemas de escrita Unicode, nem todas as combinações de alfabetos no mesmo parágrafo. Um nome com um glifo indisponível produz erro 422, preservando o registro original, em vez de exportar uma grafia corrompida. Símbolos indisponíveis em texto livre são identificados por seu código Unicode, como `[U+1F9B7]`.

O bundle de produção precisa incluir os arquivos `.ttf` e `node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm`. Configure o tracing dos endpoints PDF com `lib/fonts/**/*` e esse arquivo WASM; `subset-font` deve permanecer um pacote externo de servidor.

SHA-256:

- `DejaVuSans.ttf`: `57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e`
- `DejaVuSans-Bold.ttf`: `a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890`
- `NotoSansKR.ttf`: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`
