---
id: D-0010
data: 2026-07-16
status: vigente
modulo: Import / Excel
---

## Contexto
Na carga do modelo tabela (`js/table_import.js`) era preciso ler valores + datas da aba "Lista de pedidos". O plano previa **ExcelJS** (já usado no import da grade, `excel.js` `parseXlsxFull`).

## Alternativas consideradas
- **ExcelJS** — traz formatação além de valores; já presente no app.
- **SheetJS** (`xlsx`) — só valores + datas; também já presente (`parseXlsxFile`).

## Escolha e porquê
**SheetJS.** Na verificação, o ExcelJS **travou** (`wb.xlsx.load` nunca retornava) no arquivo real — ele tem **slicers + Excel Table** (o openpyxl também avisa "Slicer List extension"). O SheetJS lê o mesmo arquivo em ~0,5s e basta (o modelo tabela só precisa de valores + datas). `getXLSX` foi exportado de `excel.js`.

## Rotas descartadas e porquê
- ExcelJS: trava neste arquivo; não é opção para o import da tabela.

## Consequências
- `table_import.js` usa SheetJS de propósito.
- **Atenção:** o import da **grade** (`openExcelImport` → `parseXlsxFull`) ainda usa ExcelJS e pode travar com arquivos de slicers/Table — investigar/trocar se acontecer.
