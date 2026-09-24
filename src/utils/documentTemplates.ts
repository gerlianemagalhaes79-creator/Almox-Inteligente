/**
 * Document Templates Engine for Policlínica de Sobral
 * Handles HTML/CSS templates for Termos de Doação and Termos de Troca/Permuta
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { DocumentTemplate } from '../types';

export interface TemplateDataPayload {
  termNumber?: string;
  issueDate?: string;
  issueDateLong?: string;
  cityUf?: string;
  donorName?: string;
  donorCnpj?: string;
  donorAddress?: string;
  donorResponsible?: string;
  recipientName?: string;
  recipientCnpj?: string;
  recipientAddress?: string;
  recipientResponsible?: string;
  reason?: string;
  observation?: string;
  issuerName?: string;
  issuerEmail?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unit?: string;
    batch?: string;
    expiry?: string;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  receivedItems?: Array<{
    name: string;
    quantity: number;
    unit?: string;
    batch?: string;
    expiry?: string;
  }>;
  totalQuantity?: number;
  totalValue?: number;
  logoAlmoxarifado?: string | null;
  logoPoliclinica?: string | null;
  logoConsorcio?: string | null;
  letterheadImage?: string | null;
}

export const DEFAULT_DONATION_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Termo de Doação de Materiais e Insumos</title>
</head>
<body>
  <div class="document-container">
    <!-- CABEÇALHO INSTITUCIONAL -->
    <header class="doc-header">
      {{TIMBRE_CABECALHO}}
      <div class="header-rule"></div>
    </header>

    <!-- METADADOS DO DOCUMENTO -->
    <div class="doc-meta-bar">
      <div class="meta-left">
        <span class="meta-label">DOCUMENTO OFICIAL:</span>
        <span class="meta-val">TERMO-ALMOX / DOAÇÃO</span>
      </div>
      <div class="meta-center">
        <span class="meta-label">DATA DE EMISSÃO:</span>
        <span class="meta-val">{{DATA_EMISSAO}}</span>
      </div>
      <div class="meta-right">
        <span class="meta-highlight">TERMO Nº {{NUMERO_TERMO}}</span>
      </div>
    </div>

    <!-- TÍTULO PRINCIPAL -->
    <div class="doc-title-box">
      <h1 class="doc-title">TERMO DE DOAÇÃO DE MATERIAIS E INSUMOS</h1>
      <p class="doc-subtitle">SETOR DE ALMOXARIFADO E LOGÍSTICA DE SUPRIMENTOS</p>
    </div>

    <!-- PREÂMBULO JURÍDICO-ADMINISTRATIVO -->
    <section class="doc-preamble">
      <p>
        A <strong>{{UNIDADE_DOADORA}}</strong>, vinculada ao <strong>Consórcio Público de Saúde da Microrregião de Sobral (CPSMS)</strong>,
        inscrita no CNPJ sob o nº <strong>{{CNPJ_DOADORA}}</strong>, com sede em {{ENDERECO_DOADORA}}, representada neste ato pelo seu Setor de
        Almoxarifado, formaliza por meio deste instrumento a <strong>DOAÇÃO</strong> em favor de:
      </p>
      
      <div class="recipient-box">
        <div class="recipient-grid">
          <div><span class="rec-label">Unidade Receptora:</span> <strong>{{UNIDADE_RECEPTORA}}</strong></div>
          <div><span class="rec-label">CNPJ / CPF:</span> <strong>{{CNPJ_RECEPTORA}}</strong></div>
          <div class="full-row"><span class="rec-label">Endereço:</span> {{ENDERECO_RECEPTORA}}</div>
          <div><span class="rec-label">Responsável pelo Recebimento:</span> {{RESPONSAVEL_RECEPTOR}}</div>
          <div><span class="rec-label">Município / Estado:</span> {{CIDADE_UF}}</div>
        </div>
      </div>

      <p class="justification-text">
        <strong>Justificativa da Doação:</strong> {{MOTIVO_JUSTIFICATIVA}}
      </p>
    </section>

    <!-- TABELA DE MATERIAIS DOADOS -->
    <section class="doc-section">
      <h2 class="section-title">RELAÇÃO DOS MATERIAIS E INSUMOS CEDIDOS</h2>
      {{TABELA_ITENS}}
    </section>

    <!-- CONDIÇÕES E DISPOSIÇÕES FINAIS -->
    <section class="doc-clauses">
      <p><strong>Cláusula Primeira:</strong> A unidade receptora compromete-se a dar destinação estritamente pública e assistencial aos materiais doados, observadas as boas práticas de armazenamento e conservação sanitária.</p>
      <p><strong>Cláusula Segunda:</strong> Os itens foram conferidos no ato da entrega física, atestando conformidade com as especificações, prazos de validade e quantidades constantes neste termo.</p>
    </section>

    <!-- LOCAL E DATA -->
    <div class="doc-date-block">
      {{CIDADE_UF}}, {{DATA_EXTENSO}}.
    </div>

    <!-- BLOCO DE ASSINATURAS -->
    <div class="signatures-wrapper">
      <div class="sign-block">
        <div class="sign-line"></div>
        <p class="sign-name">{{UNIDADE_DOADORA}}</p>
        <p class="sign-role">Setor de Almoxarifado / Gestão de Estoque</p>
        <p class="sign-note">(Assinatura e Carimbo)</p>
      </div>

      <div class="sign-block">
        <div class="sign-line"></div>
        <p class="sign-name">{{UNIDADE_RECEPTORA}}</p>
        <p class="sign-role">Responsável pelo Recebimento / Donatário</p>
        <p class="sign-note">(Assinatura e Carimbo)</p>
      </div>
    </div>

    <!-- RODAPÉ INSTITUCIONAL -->
    <footer class="doc-footer">
      <div class="footer-rule"></div>
      <p class="footer-text">Policlínica de Sobral Bernardo Félix da Silva &bull; CPSMS &bull; Av. Monsenhor Aloísio Pinto, 481, Sobral-CE</p>
      <p class="footer-subtext">Telefone: (88) 3614-3156 &bull; cpsms.ce.gov.br &bull; Documento gerado eletronicamente pelo Sistema de Gestão de Estoque</p>
    </footer>
  </div>
</body>
</html>`;

export const DEFAULT_DONATION_CSS = `/* ESTILOS PADRÃO POLICLÍNICA DE SOBRAL - TERMO DE DOAÇÃO */
@page {
  size: A4 portrait;
  margin: 10mm 12mm 10mm 12mm;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #1e293b;
  background-color: #ffffff;
  font-size: 11px;
  line-height: 1.5;
}

.document-container {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  padding: 8px 12px;
  background: #ffffff;
}

/* CABEÇALHO */
.doc-header {
  margin-bottom: 8px;
}

.header-logos-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
}

.header-logo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 52px;
}

.header-logo-card img {
  max-height: 48px;
  max-width: 140px;
  object-fit: contain;
}

.logo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
}

.badge-almox { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.badge-poli { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; font-size: 10px; }
.badge-cpsms { background: #fff7ed; color: #c2410c; border-color: #ffedd5; }

.header-rule {
  height: 2px;
  background: linear-gradient(to right, #0284c7, #0f172a, #0284c7);
  margin-top: 4px;
}

/* BARRA DE METADADOS */
.doc-meta-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 5px 10px;
  border-radius: 6px;
  margin: 8px 0 12px 0;
  font-size: 9.5px;
}

.meta-label {
  color: #64748b;
  font-weight: 700;
  margin-right: 4px;
}

.meta-val {
  color: #0f172a;
  font-weight: 800;
}

.meta-highlight {
  background: #0284c7;
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

/* TÍTULO */
.doc-title-box {
  text-align: center;
  margin-bottom: 12px;
}

.doc-title {
  font-size: 14px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.doc-subtitle {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 1px;
}

/* PREÂMBULO */
.doc-preamble p {
  text-align: justify;
  margin-bottom: 8px;
  font-size: 10.5px;
  line-height: 1.6;
}

.recipient-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #0284c7;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
}

.recipient-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  font-size: 10px;
}

.recipient-grid .full-row {
  grid-column: span 2;
}

.rec-label {
  color: #475569;
  font-weight: 600;
}

.justification-text {
  font-size: 10.5px;
  background: #fafafa;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px dashed #cbd5e1;
}

/* SEÇÃO DA TABELA */
.doc-section {
  margin: 12px 0;
}

.section-title {
  font-size: 10.5px;
  font-weight: 800;
  color: #1e293b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 3px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5px;
  margin-top: 4px;
}

.items-table th {
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 800;
  text-align: left;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  text-transform: uppercase;
  font-size: 8.5px;
}

.items-table td {
  padding: 5px 8px;
  border: 1px solid #e2e8f0;
  vertical-align: middle;
}

.items-table tr:nth-child(even) td {
  background: #fbfcfe;
}

.items-table td.col-center {
  text-align: center;
}

.items-table td.col-bold {
  font-weight: 800;
}

.items-table tfoot td {
  background: #f8fafc;
  font-weight: 800;
  border-top: 2px solid #cbd5e1;
}

/* CLÁUSULAS */
.doc-clauses {
  font-size: 9.5px;
  color: #475569;
  margin: 10px 0;
  padding: 6px 10px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.doc-clauses p {
  margin-bottom: 4px;
}

.doc-clauses p:last-child {
  margin-bottom: 0;
}

/* DATA */
.doc-date-block {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #0f172a;
  margin: 16px 0 28px 0;
}

/* ASSINATURAS */
.signatures-wrapper {
  display: flex;
  justify-content: space-between;
  gap: 30px;
  margin-top: 20px;
  page-break-inside: avoid;
}

.sign-block {
  flex: 1;
  text-align: center;
}

.sign-line {
  border-top: 1.5px solid #475569;
  margin-bottom: 6px;
  width: 85%;
  margin-left: auto;
  margin-right: auto;
}

.sign-name {
  font-size: 10px;
  font-weight: 800;
  color: #0f172a;
}

.sign-role {
  font-size: 9px;
  color: #475569;
  font-weight: 600;
}

.sign-note {
  font-size: 8px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 2px;
}

/* RODAPÉ */
.doc-footer {
  margin-top: 24px;
  text-align: center;
  page-break-inside: avoid;
}

.footer-rule {
  height: 1px;
  background: #e2e8f0;
  margin-bottom: 6px;
}

.footer-text {
  font-size: 8px;
  font-weight: 700;
  color: #64748b;
}

.footer-subtext {
  font-size: 7.5px;
  color: #94a3b8;
  margin-top: 2px;
}

@media print {
  body {
    background: transparent;
  }
  .document-container {
    padding: 0;
    max-width: 100%;
  }
}
`;

export const DEFAULT_EXCHANGE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Termo de Permuta e Troca de Materiais e Medicamentos</title>
</head>
<body>
  <div class="document-container">
    <!-- CABEÇALHO INSTITUCIONAL -->
    <header class="doc-header">
      {{TIMBRE_CABECALHO}}
      <div class="header-rule"></div>
    </header>

    <!-- METADADOS DO DOCUMENTO -->
    <div class="doc-meta-bar">
      <div class="meta-left">
        <span class="meta-label">DOCUMENTO:</span>
        <span class="meta-val">TERMO-ALMOX / PERMUTA</span>
      </div>
      <div class="meta-center">
        <span class="meta-label">DATA DE EMISSÃO:</span>
        <span class="meta-val">{{DATA_EMISSAO}}</span>
      </div>
      <div class="meta-right">
        <span class="meta-highlight">PERMUTA Nº {{NUMERO_TERMO}}</span>
      </div>
    </div>

    <!-- TÍTULO PRINCIPAL -->
    <div class="doc-title-box">
      <h1 class="doc-title">TERMO DE TROCA E PERMUTA DE MATERIAIS E INSUMOS</h1>
      <p class="doc-subtitle">SETOR DE ALMOXARIFADO / FARMÁCIA CENTRAL &bull; CPSMS</p>
    </div>

    <!-- PREÂMBULO JURÍDICO-ADMINISTRATIVO -->
    <section class="doc-preamble">
      <p>
        Pelo presente instrumento de cooperação mútua, a <strong>{{UNIDADE_DOADORA}}</strong>, integrante do <strong>Consórcio Público de Saúde da Microrregião de Sobral (CPSMS)</strong>,
        inscrita no CNPJ sob o nº <strong>{{CNPJ_DOADORA}}</strong>, e o <strong>Órgão/Instituição Parceira</strong> abaixo identificado,
        celebram a presente <strong>PERMUTA DE MATERIAIS / INSUMOS</strong>, visando o abastecimento recíproco e a continuidade ininterrupta da assistência em saúde:
      </p>
      
      <div class="partner-box">
        <div class="partner-grid">
          <div><span class="p-label">Instituição Parceira:</span> <strong>{{ORGAO_PARCEIRO}}</strong></div>
          <div><span class="p-label">CNPJ / CPF:</span> <strong>{{CNPJ_PARCEIRO}}</strong></div>
          <div class="full-row"><span class="p-label">Endereço:</span> {{ENDERECO_PARCEIRO}}</div>
          <div><span class="p-label">Responsável / Cargo:</span> {{RESPONSAVEL_RECEPTOR}}</div>
          <div><span class="p-label">Município / Estado:</span> {{CIDADE_UF}}</div>
        </div>
      </div>

      <p class="justification-text">
        <strong>Justificativa Técnica da Troca:</strong> {{MOTIVO_JUSTIFICATIVA}}
      </p>
    </section>

    <!-- MATERIAIS CEDIDOS -->
    <section class="doc-section">
      <h2 class="section-title cedidos">1. MATERIAIS CEDIDOS PELA POLICLÍNICA DE SOBRAL</h2>
      {{TABELA_ITENS_CEDIDOS}}
    </section>

    <!-- MATERIAIS RECEBIDOS EM CONTRAPARTIDA -->
    <section class="doc-section">
      <h2 class="section-title recebidos">2. MATERIAIS RECEBIDOS EM CONTRAPARTIDA / COMPENSAÇÃO</h2>
      {{TABELA_ITENS_RECEBIDOS}}
    </section>

    <!-- DECLARAÇÃO DE EQUIVALÊNCIA -->
    <section class="doc-clauses">
      <p><strong>Declaração de Conformidade:</strong> As partes signatárias declaram que a presente permuta atende aos princípios da economicidade, conveniência administrativa e interesse público, tendo sido conferidos lotes, prazos de validade e a integridade de embalagens de todos os produtos envolvidos.</p>
    </section>

    <!-- LOCAL E DATA -->
    <div class="doc-date-block">
      {{CIDADE_UF}}, {{DATA_EXTENSO}}.
    </div>

    <!-- BLOCO DE ASSINATURAS -->
    <div class="signatures-wrapper">
      <div class="sign-block">
        <div class="sign-line"></div>
        <p class="sign-name">{{UNIDADE_DOADORA}}</p>
        <p class="sign-role">Responsável pelo Almoxarifado / Farmácia</p>
        <p class="sign-note">(Assinatura e Carimbo)</p>
      </div>

      <div class="sign-block">
        <div class="sign-line"></div>
        <p class="sign-name">{{ORGAO_PARCEIRO}}</p>
        <p class="sign-role">Representante Legal da Unidade Parceira</p>
        <p class="sign-note">(Assinatura e Carimbo)</p>
      </div>
    </div>

    <!-- RODAPÉ INSTITUCIONAL -->
    <footer class="doc-footer">
      <div class="footer-rule"></div>
      <p class="footer-text">Policlínica de Sobral Bernardo Félix da Silva &bull; Consórcio Público de Saúde da Microrregião de Sobral (CPSMS)</p>
      <p class="footer-subtext">Av. Monsenhor Aloísio Pinto, 481, Sobral-CE &bull; Fone: (88) 3614-3156 &bull; cpsms.ce.gov.br</p>
    </footer>
  </div>
</body>
</html>`;

export const DEFAULT_EXCHANGE_CSS = `/* ESTILOS PADRÃO POLICLÍNICA DE SOBRAL - TERMO DE TROCA E PERMUTA */
@page {
  size: A4 portrait;
  margin: 10mm 12mm 10mm 12mm;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #1e293b;
  background-color: #ffffff;
  font-size: 11px;
  line-height: 1.5;
}

.document-container {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  padding: 8px 12px;
  background: #ffffff;
}

/* CABEÇALHO */
.doc-header {
  margin-bottom: 8px;
}

.header-logos-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
}

.header-logo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 52px;
}

.header-logo-card img {
  max-height: 48px;
  max-width: 140px;
  object-fit: contain;
}

.logo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
}

.badge-almox { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.badge-poli { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; font-size: 10px; }
.badge-cpsms { background: #fff7ed; color: #c2410c; border-color: #ffedd5; }

.header-rule {
  height: 2px;
  background: linear-gradient(to right, #2563eb, #0f172a, #2563eb);
  margin-top: 4px;
}

/* BARRA DE METADADOS */
.doc-meta-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 5px 10px;
  border-radius: 6px;
  margin: 8px 0 12px 0;
  font-size: 9.5px;
}

.meta-label {
  color: #64748b;
  font-weight: 700;
  margin-right: 4px;
}

.meta-val {
  color: #0f172a;
  font-weight: 800;
}

.meta-highlight {
  background: #2563eb;
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

/* TÍTULO */
.doc-title-box {
  text-align: center;
  margin-bottom: 12px;
}

.doc-title {
  font-size: 13.5px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.doc-subtitle {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 1px;
}

/* PREÂMBULO */
.doc-preamble p {
  text-align: justify;
  margin-bottom: 8px;
  font-size: 10px;
  line-height: 1.55;
}

.partner-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #2563eb;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
}

.partner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  font-size: 10px;
}

.partner-grid .full-row {
  grid-column: span 2;
}

.p-label {
  color: #475569;
  font-weight: 600;
}

.justification-text {
  font-size: 10px;
  background: #fafafa;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px dashed #cbd5e1;
}

/* SEÇÃO DA TABELA */
.doc-section {
  margin: 10px 0;
}

.section-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
  padding-bottom: 3px;
  border-bottom: 1.5px solid #cbd5e1;
}

.section-title.cedidos {
  color: #1e3a8a;
  border-color: #93c5fd;
}

.section-title.recebidos {
  color: #15803d;
  border-color: #86efac;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9px;
  margin-top: 3px;
}

.items-table th {
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 800;
  text-align: left;
  padding: 5px 7px;
  border: 1px solid #cbd5e1;
  text-transform: uppercase;
  font-size: 8px;
}

.items-table td {
  padding: 4px 7px;
  border: 1px solid #e2e8f0;
  vertical-align: middle;
}

.items-table tr:nth-child(even) td {
  background: #fbfcfe;
}

.items-table td.col-center {
  text-align: center;
}

.items-table td.col-bold {
  font-weight: 800;
}

/* CLÁUSULAS */
.doc-clauses {
  font-size: 9px;
  color: #475569;
  margin: 8px 0;
  padding: 6px 10px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

/* DATA */
.doc-date-block {
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  color: #0f172a;
  margin: 14px 0 24px 0;
}

/* ASSINATURAS */
.signatures-wrapper {
  display: flex;
  justify-content: space-between;
  gap: 30px;
  margin-top: 18px;
  page-break-inside: avoid;
}

.sign-block {
  flex: 1;
  text-align: center;
}

.sign-line {
  border-top: 1.5px solid #475569;
  margin-bottom: 5px;
  width: 85%;
  margin-left: auto;
  margin-right: auto;
}

.sign-name {
  font-size: 9.5px;
  font-weight: 800;
  color: #0f172a;
}

.sign-role {
  font-size: 8.5px;
  color: #475569;
  font-weight: 600;
}

.sign-note {
  font-size: 8px;
  color: #94a3b8;
  font-style: italic;
}

/* RODAPÉ */
.doc-footer {
  margin-top: 20px;
  text-align: center;
  page-break-inside: avoid;
}

.footer-rule {
  height: 1px;
  background: #e2e8f0;
  margin-bottom: 5px;
}

.footer-text {
  font-size: 8px;
  font-weight: 700;
  color: #64748b;
}

.footer-subtext {
  font-size: 7.5px;
  color: #94a3b8;
  margin-top: 2px;
}

@media print {
  body {
    background: transparent;
  }
  .document-container {
    padding: 0;
    max-width: 100%;
  }
}
`;

/**
 * Builds the HTML table for items
 */
export function buildItemsTableHtml(items: TemplateDataPayload['items']): string {
  if (!items || items.length === 0) {
    return `<div style="padding: 12px; text-align: center; color: #64748b; font-style: italic; border: 1px dashed #cbd5e1; border-radius: 4px;">Nenhum item discriminado neste termo.</div>`;
  }

  const rows = items.map((it, idx) => `
    <tr>
      <td class="col-center" style="width: 35px;">${idx + 1}</td>
      <td class="col-bold">${it.name}</td>
      <td class="col-center" style="width: 75px;">${it.batch || '---'}</td>
      <td class="col-center" style="width: 75px;">${it.expiry || '---'}</td>
      <td class="col-center" style="width: 55px;">${it.unit || 'UN'}</td>
      <td class="col-center col-bold" style="width: 65px;">${it.quantity}</td>
      <td class="col-center" style="width: 60px;">[ &nbsp; ]</td>
    </tr>
  `).join('');

  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  return `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th>Descrição do Material / Insumo</th>
          <th style="width: 75px; text-align: center;">Lote</th>
          <th style="width: 75px; text-align: center;">Validade</th>
          <th style="width: 55px; text-align: center;">Unid.</th>
          <th style="width: 65px; text-align: center;">Qtd.</th>
          <th style="width: 60px; text-align: center;">Conf.</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align: right; font-weight: 800; padding: 6px 8px;">TOTAL DE ITENS:</td>
          <td class="col-center col-bold" style="padding: 6px 8px;">${totalQty}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
}

/**
 * Builds the HTML table for received items in exchange
 */
export function buildReceivedItemsTableHtml(items: TemplateDataPayload['receivedItems']): string {
  if (!items || items.length === 0) {
    return `<div style="padding: 10px; text-align: center; color: #64748b; font-style: italic; border: 1px dashed #cbd5e1; border-radius: 4px;">Nenhum item recebido registrado nesta troca.</div>`;
  }

  const rows = items.map((it, idx) => `
    <tr>
      <td class="col-center" style="width: 35px;">${idx + 1}</td>
      <td class="col-bold">${it.name}</td>
      <td class="col-center" style="width: 80px;">${it.batch || '---'}</td>
      <td class="col-center" style="width: 80px;">${it.expiry || '---'}</td>
      <td class="col-center" style="width: 55px;">${it.unit || 'UN'}</td>
      <td class="col-center col-bold" style="width: 65px;">${it.quantity}</td>
      <td class="col-center" style="width: 60px;">[ &nbsp; ]</td>
    </tr>
  `).join('');

  return `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th>Descrição do Material Recebido em Contrapartida</th>
          <th style="width: 80px; text-align: center;">Lote</th>
          <th style="width: 80px; text-align: center;">Validade</th>
          <th style="width: 55px; text-align: center;">Unid.</th>
          <th style="width: 65px; text-align: center;">Qtd.</th>
          <th style="width: 60px; text-align: center;">Conf.</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Builds the official 3-logo letterhead HTML
 */
export function buildLetterheadHtml(
  logoAlmoxarifado?: string | null,
  logoPoliclinica?: string | null,
  logoConsorcio?: string | null,
  letterheadImage?: string | null
): string {
  if (letterheadImage) {
    return `<div style="width: 100%; text-align: center;"><img src="${letterheadImage}" style="max-width: 100%; max-height: 70px; object-fit: contain;" alt="Timbre Institucional" /></div>`;
  }

  const almoxLogoHtml = logoAlmoxarifado
    ? `<img src="${logoAlmoxarifado}" alt="Almoxarifado" />`
    : `<div class="logo-badge badge-almox">ALMOXARIFADO<br><span style="font-size:7.5px;font-weight:normal">GESTÃO DE ESTOQUE</span></div>`;

  const poliLogoHtml = logoPoliclinica
    ? `<img src="${logoPoliclinica}" alt="Policlínica de Sobral" />`
    : `<div class="logo-badge badge-poli">POLICLÍNICA DE SOBRAL<br><span style="font-size:7.5px;font-weight:normal">BERNARDO FÉLIX DA SILVA</span></div>`;

  const consLogoHtml = logoConsorcio
    ? `<img src="${logoConsorcio}" alt="Consórcio CPSMS" />`
    : `<div class="logo-badge badge-cpsms">CONSÓRCIO CPSMS<br><span style="font-size:7.5px;font-weight:normal">MICRORREGIÃO DE SOBRAL</span></div>`;

  return `
    <div class="header-logos-row">
      <div class="header-logo-card">${almoxLogoHtml}</div>
      <div class="header-logo-card">${poliLogoHtml}</div>
      <div class="header-logo-card">${consLogoHtml}</div>
    </div>
  `;
}

/**
 * Replaces all placeholders in HTML template with real or sample data
 */
export function renderTemplate(
  htmlContent: string,
  cssContent: string,
  payload: TemplateDataPayload
): string {
  let renderedHtml = htmlContent;

  const timbreHtml = buildLetterheadHtml(
    payload.logoAlmoxarifado,
    payload.logoPoliclinica,
    payload.logoConsorcio,
    payload.letterheadImage
  );

  const itemsTableHtml = buildItemsTableHtml(payload.items);
  const receivedItemsTableHtml = buildReceivedItemsTableHtml(payload.receivedItems);

  const replacements: Record<string, string> = {
    '{{TIMBRE_CABECALHO}}': timbreHtml,
    '{{NUMERO_TERMO}}': payload.termNumber || '001/2026',
    '{{DATA_EMISSAO}}': payload.issueDate || new Date().toLocaleDateString('pt-BR'),
    '{{DATA_EXTENSO}}': payload.issueDateLong || '16 de setembro de 2026',
    '{{CIDADE_UF}}': payload.cityUf || 'Sobral - CE',
    '{{UNIDADE_DOADORA}}': payload.donorName || 'Policlínica de Sobral Bernardo Félix da Silva',
    '{{CNPJ_DOADORA}}': payload.donorCnpj || '12.208.466/0001-66',
    '{{ENDERECO_DOADORA}}': payload.donorAddress || 'Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE',
    '{{RESPONSAVEL_DOADOR}}': payload.donorResponsible || 'Setor de Almoxarifado',
    '{{UNIDADE_RECEPTORA}}': payload.recipientName || 'Hospital Municipal de Santana do Acaraú',
    '{{ORGAO_PARCEIRO}}': payload.recipientName || 'Secretaria Municipal de Saúde de Forquilha',
    '{{CNPJ_RECEPTORA}}': payload.recipientCnpj || '07.598.667/0001-14',
    '{{CNPJ_PARCEIRO}}': payload.recipientCnpj || '07.598.667/0001-14',
    '{{ENDERECO_RECEPTORA}}': payload.recipientAddress || 'Rua Coronel José Silvestre, 120, Centro',
    '{{ENDERECO_PARCEIRO}}': payload.recipientAddress || 'Rua Coronel José Silvestre, 120, Centro',
    '{{RESPONSAVEL_RECEPTOR}}': payload.recipientResponsible || 'Dr. Carlos Eduardo Menezes (Coordenador de Suprimentos)',
    '{{MOTIVO_JUSTIFICATIVA}}': payload.reason || 'Otimização e remanejamento de estoque em virtude da sazonalidade de demanda e apoio ao abastecimento da rede pública de saúde.',
    '{{OBSERVACOES}}': payload.observation || 'Itens em perfeito estado de conservação física e sanitária.',
    '{{TABELA_ITENS}}': itemsTableHtml,
    '{{TABELA_ITENS_CEDIDOS}}': itemsTableHtml,
    '{{TABELA_ITENS_RECEBIDOS}}': receivedItemsTableHtml,
    '{{TOTAL_ITENS}}': String(payload.totalQuantity || (payload.items ? payload.items.reduce((acc, i) => acc + (i.quantity || 0), 0) : 0)),
    '{{VALOR_TOTAL}}': payload.totalValue ? `R$ ${payload.totalValue.toFixed(2).replace('.', ',')}` : 'R$ 0,00',
    '{{RESPONSAVEL_EMISSAO}}': payload.issuerName || 'Almoxarifado Central'
  };

  for (const [placeholder, val] of Object.entries(replacements)) {
    renderedHtml = renderedHtml.split(placeholder).join(val);
  }

  // Inject the custom CSS into the head
  if (renderedHtml.includes('</head>')) {
    renderedHtml = renderedHtml.replace('</head>', `<style>\n${cssContent}\n</style>\n</head>`);
  } else {
    renderedHtml = `<style>\n${cssContent}\n</style>\n${renderedHtml}`;
  }

  return renderedHtml;
}

/**
 * Direct print using hidden iframe or popup window
 * Guarantees 100% vector typography, accurate margins and sharp printing
 */
export function printRenderedDocument(renderedHtml: string, title = 'Documento_Policlinica'): void {
  const printWindow = window.open('', '_blank', 'width=850,height=950');
  if (!printWindow) {
    alert('Por favor, permita popups para abrir a janela de impressão do documento.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        ${renderedHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Direct PDF download using html2canvas + jsPDF
 */
export async function downloadRenderedDocumentPdf(
  renderedHtml: string,
  filename = 'Termo_Policlinica.pdf'
): Promise<void> {
  // Create an off-screen container with exact A4 dimensions
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '794px'; // 210mm @ 96 DPI
  container.style.minHeight = '1123px'; // 297mm @ 96 DPI
  container.style.background = '#ffffff';
  container.style.color = '#000000';
  container.innerHTML = renderedHtml;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2, // High DPI for crisp vector-like text
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
