import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  FileCode, 
  Eye, 
  Upload, 
  Download, 
  Printer, 
  RotateCcw, 
  Check, 
  Save, 
  Plus, 
  Trash2, 
  Sparkles, 
  Info, 
  HelpCircle,
  X,
  Building,
  Calendar,
  Layers,
  ArrowRightLeft,
  Gift
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Item, Transaction, UserProfile } from '../types';
import { 
  DEFAULT_DONATION_HTML, 
  DEFAULT_DONATION_CSS, 
  DEFAULT_EXCHANGE_HTML, 
  DEFAULT_EXCHANGE_CSS,
  renderTemplate, 
  printRenderedDocument, 
  downloadRenderedDocumentPdf, 
  TemplateDataPayload 
} from '../utils/documentTemplates';

interface DocumentTemplatesTabProps {
  userProfile: UserProfile | null;
  items: Item[];
  transactions: Transaction[];
  appLogo: string | null;
  appRectangularLogo: string | null;
  policlinicaLogo: string | null;
  consorcioLogo: string | null;
  letterheadImage: string | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function DocumentTemplatesTab({
  userProfile,
  items,
  transactions,
  appLogo,
  appRectangularLogo,
  policlinicaLogo,
  consorcioLogo,
  letterheadImage,
  showToast
}: DocumentTemplatesTabProps) {
  const [activeTemplateType, setActiveTemplateType] = useState<'donation' | 'exchange'>('donation');
  const [editorMode, setEditorMode] = useState<'html' | 'css'>('html');

  // Donation State
  const [donationHtml, setDonationHtml] = useState(DEFAULT_DONATION_HTML);
  const [donationCss, setDonationCss] = useState(DEFAULT_DONATION_CSS);

  // Exchange State
  const [exchangeHtml, setExchangeHtml] = useState(DEFAULT_EXCHANGE_HTML);
  const [exchangeCss, setExchangeCss] = useState(DEFAULT_EXCHANGE_CSS);

  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Preview Data Mode: 'sample' or 'real'
  const [previewDataSource, setPreviewDataSource] = useState<'sample' | 'real'>('sample');
  const [selectedRealTxId, setSelectedRealTxId] = useState<string>('');

  // Modal: Emitir Termo Avulso
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType] = useState<'donation' | 'exchange'>('donation');
  const [issueTermNumber, setIssueTermNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueRecipientName, setIssueRecipientName] = useState('');
  const [issueRecipientCnpj, setIssueRecipientCnpj] = useState('');
  const [issueRecipientAddress, setIssueRecipientAddress] = useState('');
  const [issueRecipientResponsible, setIssueRecipientResponsible] = useState('');
  const [issueReason, setIssueReason] = useState('');
  const [issueItems, setIssueItems] = useState<Array<{ name: string; quantity: number; batch?: string; expiry?: string; unit?: string }>>([
    { name: '', quantity: 1, batch: '', expiry: '', unit: 'UN' }
  ]);
  const [issueReceivedItems, setIssueReceivedItems] = useState<Array<{ name: string; quantity: number; batch?: string; expiry?: string; unit?: string }>>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const htmlEditorRef = useRef<HTMLTextAreaElement | null>(null);

  // Load templates from Firestore on mount
  useEffect(() => {
    loadSavedTemplates();
  }, []);

  const loadSavedTemplates = async () => {
    setLoadingTemplate(true);
    try {
      // 1. Try local cache
      const cachedDonationHtml = localStorage.getItem('template_donation_html');
      const cachedDonationCss = localStorage.getItem('template_donation_css');
      const cachedExchangeHtml = localStorage.getItem('template_exchange_html');
      const cachedExchangeCss = localStorage.getItem('template_exchange_css');

      if (cachedDonationHtml) setDonationHtml(cachedDonationHtml);
      if (cachedDonationCss) setDonationCss(cachedDonationCss);
      if (cachedExchangeHtml) setExchangeHtml(cachedExchangeHtml);
      if (cachedExchangeCss) setExchangeCss(cachedExchangeCss);

      // 2. Load from Firestore
      const donationDoc = await getDoc(doc(db, 'settings', 'template_donation'));
      if (donationDoc.exists()) {
        const d = donationDoc.data();
        if (d.htmlContent) setDonationHtml(d.htmlContent);
        if (d.cssContent) setDonationCss(d.cssContent);
      }

      const exchangeDoc = await getDoc(doc(db, 'settings', 'template_exchange'));
      if (exchangeDoc.exists()) {
        const e = exchangeDoc.data();
        if (e.htmlContent) setExchangeHtml(e.htmlContent);
        if (e.cssContent) setExchangeCss(e.cssContent);
      }
    } catch (err) {
      console.warn("Could not load templates from Firestore:", err);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      setIsSaving(true);
      const isDonation = activeTemplateType === 'donation';
      const docName = isDonation ? 'template_donation' : 'template_exchange';
      const htmlToSave = isDonation ? donationHtml : exchangeHtml;
      const cssToSave = isDonation ? donationCss : exchangeCss;

      // Save to localStorage
      if (isDonation) {
        localStorage.setItem('template_donation_html', htmlToSave);
        localStorage.setItem('template_donation_css', cssToSave);
      } else {
        localStorage.setItem('template_exchange_html', htmlToSave);
        localStorage.setItem('template_exchange_css', cssToSave);
      }

      // Save to Firestore
      await setDoc(doc(db, 'settings', docName), {
        title: isDonation ? 'Termo de Doação de Materiais e Insumos' : 'Termo de Troca e Permuta',
        type: activeTemplateType,
        htmlContent: htmlToSave,
        cssContent: cssToSave,
        updatedAt: serverTimestamp(),
        updatedBy: userProfile?.name || userProfile?.email || 'Administrador'
      }, { merge: true });

      showToast(`Modelo de ${isDonation ? 'Doação' : 'Troca'} salvo com sucesso!`, 'success');
    } catch (err: any) {
      console.error("Erro ao salvar template:", err);
      showToast(`Erro ao salvar modelo: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (confirm(`Deseja restaurar o modelo padrão oficial da Policlínica de Sobral para ${activeTemplateType === 'donation' ? 'Doação' : 'Troca'}? Todas as alterações manuais não salvas serão substituídas.`)) {
      if (activeTemplateType === 'donation') {
        setDonationHtml(DEFAULT_DONATION_HTML);
        setDonationCss(DEFAULT_DONATION_CSS);
        localStorage.removeItem('template_donation_html');
        localStorage.removeItem('template_donation_css');
      } else {
        setExchangeHtml(DEFAULT_EXCHANGE_HTML);
        setExchangeCss(DEFAULT_EXCHANGE_CSS);
        localStorage.removeItem('template_exchange_html');
        localStorage.removeItem('template_exchange_css');
      }
      showToast("Modelo padrão oficial restaurado com sucesso!", "info");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (editorMode === 'html') {
        if (activeTemplateType === 'donation') {
          setDonationHtml(content);
        } else {
          setExchangeHtml(content);
        }
        showToast(`Template HTML carregado com sucesso (${file.name})!`, 'success');
      } else {
        if (activeTemplateType === 'donation') {
          setDonationCss(content);
        } else {
          setExchangeCss(content);
        }
        showToast(`Estilos CSS carregados com sucesso (${file.name})!`, 'success');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportHtml = () => {
    const isDonation = activeTemplateType === 'donation';
    const htmlContent = isDonation ? donationHtml : exchangeHtml;
    const cssContent = isDonation ? donationCss : exchangeCss;

    const fullDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${isDonation ? 'Template_Termo_Doacao' : 'Template_Termo_Troca'}</title>
  <style>
${cssContent}
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${isDonation ? 'Template_Termo_Doacao_Policlinica' : 'Template_Termo_Troca_Policlinica'}.html`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Template exportado em arquivo HTML!", "success");
  };

  const insertVariableTag = (tag: string) => {
    const textarea = htmlEditorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = activeTemplateType === 'donation' 
      ? (editorMode === 'html' ? donationHtml : donationCss)
      : (editorMode === 'html' ? exchangeHtml : exchangeCss);

    const newVal = currentVal.substring(0, start) + tag + currentVal.substring(end);

    if (activeTemplateType === 'donation') {
      if (editorMode === 'html') setDonationHtml(newVal);
      else setDonationCss(newVal);
    } else {
      if (editorMode === 'html') setExchangeHtml(newVal);
      else setExchangeCss(newVal);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Build the live preview payload
  const currentPayload: TemplateDataPayload = (() => {
    const baseLogos = {
      logoAlmoxarifado: appRectangularLogo || appLogo,
      logoPoliclinica: policlinicaLogo,
      logoConsorcio: consorcioLogo,
      letterheadImage: letterheadImage
    };

    if (previewDataSource === 'real' && selectedRealTxId) {
      const tx = transactions.find(t => t.id === selectedRealTxId);
      if (tx) {
        return {
          ...baseLogos,
          termNumber: tx.donationNumber || tx.exchangeNumber || '042/2026',
          issueDate: new Date(tx.date).toLocaleDateString('pt-BR'),
          issueDateLong: new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          cityUf: 'Sobral - CE',
          donorName: 'Policlínica de Sobral Bernardo Félix da Silva',
          donorCnpj: '12.208.466/0001-66',
          donorAddress: 'Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE',
          recipientName: tx.donationUnitName || tx.exchangePartnerName || 'Unidade Parceira de Saúde',
          recipientCnpj: tx.donationUnitCNPJ || tx.exchangePartnerCNPJ || '07.598.667/0001-14',
          recipientAddress: tx.donationUnitAddress || tx.exchangePartnerAddress || 'Sobral - CE',
          recipientResponsible: tx.responsible || 'Responsável pelo Recebimento',
          reason: tx.observation || tx.expiryReason || 'Otimização e remanejamento do estoque do Almoxarifado Central.',
          items: [
            {
              name: tx.item_name,
              quantity: tx.quantity,
              batch: tx.batch_number || 'LT-2026A',
              expiry: tx.expiry_date ? new Date(tx.expiry_date).toLocaleDateString('pt-BR') : '---',
              unit: 'UN'
            }
          ]
        };
      }
    }

    // Default Sample Data
    if (activeTemplateType === 'donation') {
      return {
        ...baseLogos,
        termNumber: '015/2026',
        issueDate: new Date().toLocaleDateString('pt-BR'),
        issueDateLong: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
        cityUf: 'Sobral - CE',
        donorName: 'Policlínica de Sobral Bernardo Félix da Silva',
        donorCnpj: '12.208.466/0001-66',
        donorAddress: 'Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE',
        donorResponsible: 'Coordenação de Almoxarifado e Farmácia',
        recipientName: 'Hospital Municipal Dr. José Euclides Ferreira Gomes',
        recipientCnpj: '07.598.667/0001-14',
        recipientAddress: 'Rua Menino Deus, 350, Centro, Sobral - CE',
        recipientResponsible: 'Dra. Mariana Albuquerque (Farmacêutica Responsável)',
        reason: 'Otimização de insumos hospitalares e fortalecimento da assistência em saúde da rede pública regional.',
        observation: 'Lotes rigorosamente inspecionados com laudo e prazo de validade conforme normas sanitárias da ANVISA.',
        items: [
          { name: 'Seringa Descartável 10ml com Agulha 25x7', quantity: 200, unit: 'UN', batch: 'SRG-8841', expiry: '12/2027' },
          { name: 'Luva de Procedimento Cirúrgico Látex Tamanho M', quantity: 50, unit: 'CX', batch: 'LV-9923', expiry: '08/2027' },
          { name: 'Equipo Macrogotas com Injetor Lateral Estéril', quantity: 150, unit: 'UN', batch: 'EQP-4412', expiry: '10/2026' },
          { name: 'Cateter Intravenoso Periférico 20G', quantity: 80, unit: 'UN', batch: 'CAT-1029', expiry: '04/2028' }
        ]
      };
    } else {
      return {
        ...baseLogos,
        termNumber: '008/2026',
        issueDate: new Date().toLocaleDateString('pt-BR'),
        issueDateLong: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
        cityUf: 'Sobral - CE',
        donorName: 'Policlínica de Sobral Bernardo Félix da Silva',
        donorCnpj: '12.208.466/0001-66',
        donorAddress: 'Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE',
        recipientName: 'Secretaria Municipal de Saúde de Forquilha - CE',
        recipientCnpj: '06.598.112/0001-89',
        recipientAddress: 'Av. Dr. Afonso Rodrigues, 102, Centro - Forquilha/CE',
        recipientResponsible: 'Dr. Leonardo Vasconcelos (Coordenador de Assistência Farmacêutica)',
        reason: 'Compensação recíproca de itens de urgência hospitalar para suprir carência emergencial mútua.',
        items: [
          { name: 'Amoxicilina + Clavulanato de Potássio 500mg/125mg', quantity: 120, unit: 'CX', batch: 'AMX-2026', expiry: '09/2027' },
          { name: 'Dipirona Sódica 500mg/ml Gotas 20ml', quantity: 100, unit: 'FR', batch: 'DIP-7731', expiry: '11/2027' }
        ],
        receivedItems: [
          { name: 'Paracetamol 500mg Comprimido', quantity: 300, unit: 'CP', batch: 'PRC-5521', expiry: '05/2028' },
          { name: 'Soro Fisiológico 0,9% Bolsa 500ml', quantity: 80, unit: 'FR', batch: 'SOR-9092', expiry: '03/2027' }
        ]
      };
    }
  })();

  const currentHtml = activeTemplateType === 'donation' ? donationHtml : exchangeHtml;
  const currentCss = activeTemplateType === 'donation' ? donationCss : exchangeCss;
  const renderedHtml = renderTemplate(currentHtml, currentCss, currentPayload);

  const handlePrintTest = () => {
    printRenderedDocument(renderedHtml, `Termo_${activeTemplateType === 'donation' ? 'Doacao' : 'Troca'}_Policlinica`);
  };

  const handleDownloadPdfTest = async () => {
    try {
      setIsExportingPdf(true);
      showToast("Gerando PDF oficial com alta fidelidade visual...", "info");
      await downloadRenderedDocumentPdf(
        renderedHtml, 
        `Termo_${activeTemplateType === 'donation' ? 'Doacao' : 'Troca'}_Policlinica_${new Date().toISOString().split('T')[0]}.pdf`
      );
      showToast("PDF baixado com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      showToast(`Erro ao gerar PDF: ${err.message}`, "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Direct Term Issuance Submission
  const handleDirectIssue = async () => {
    if (!issueRecipientName.trim()) {
      alert("Por favor, preencha o nome da unidade receptora / parceira.");
      return;
    }

    const validItems = issueItems.filter(i => i.name.trim() && i.quantity > 0);
    if (validItems.length === 0) {
      alert("Adicione ao menos 1 item com descrição e quantidade.");
      return;
    }

    const payload: TemplateDataPayload = {
      logoAlmoxarifado: appRectangularLogo || appLogo,
      logoPoliclinica: policlinicaLogo,
      logoConsorcio: consorcioLogo,
      letterheadImage: letterheadImage,
      termNumber: issueTermNumber.trim() || `${Math.floor(Math.random() * 900 + 100)}/${new Date().getFullYear()}`,
      issueDate: new Date(issueDate).toLocaleDateString('pt-BR'),
      issueDateLong: new Date(issueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      cityUf: 'Sobral - CE',
      donorName: 'Policlínica de Sobral Bernardo Félix da Silva',
      donorCnpj: '12.208.466/0001-66',
      donorAddress: 'Av. Monsenhor Aloísio Pinto, 481, CEP 62050-255, Sobral-CE',
      donorResponsible: 'Setor de Almoxarifado / Farmácia',
      recipientName: issueRecipientName,
      recipientCnpj: issueRecipientCnpj || '---',
      recipientAddress: issueRecipientAddress || '---',
      recipientResponsible: issueRecipientResponsible || 'Responsável pelo Recebimento',
      reason: issueReason || (issueType === 'donation' 
        ? 'Doação para fortalecimento do atendimento de saúde da rede pública.' 
        : 'Permuta e compensação recíproca entre órgãos públicos de saúde.'),
      items: validItems,
      receivedItems: issueType === 'exchange' ? issueReceivedItems.filter(i => i.name.trim()) : undefined
    };

    const docHtml = issueType === 'donation' ? donationHtml : exchangeHtml;
    const docCss = issueType === 'donation' ? donationCss : exchangeCss;
    const finalHtml = renderTemplate(docHtml, docCss, payload);

    printRenderedDocument(finalHtml, `Termo_${issueType === 'donation' ? 'Doacao' : 'Troca'}_${issueRecipientName.replace(/\s+/g, '_')}`);
    showToast(`Termo de ${issueType === 'donation' ? 'Doação' : 'Troca'} emitido com sucesso!`, 'success');
    setShowIssueModal(false);
  };

  const variableCategories = [
    {
      title: 'Identificação & Datas',
      tags: ['{{NUMERO_TERMO}}', '{{DATA_EMISSAO}}', '{{DATA_EXTENSO}}', '{{CIDADE_UF}}']
    },
    {
      title: 'Policlínica / Cedente',
      tags: ['{{TIMBRE_CABECALHO}}', '{{UNIDADE_DOADORA}}', '{{CNPJ_DOADORA}}', '{{ENDERECO_DOADORA}}', '{{RESPONSAVEL_DOADOR}}']
    },
    {
      title: 'Destinatário / Parceiro',
      tags: ['{{UNIDADE_RECEPTORA}}', '{{ORGAO_PARCEIRO}}', '{{CNPJ_RECEPTORA}}', '{{ENDERECO_RECEPTORA}}', '{{RESPONSAVEL_RECEPTOR}}']
    },
    {
      title: 'Itens & Tabelas',
      tags: ['{{TABELA_ITENS}}', '{{TABELA_ITENS_CEDIDOS}}', '{{TABELA_ITENS_RECEBIDOS}}', '{{TOTAL_ITENS}}', '{{VALOR_TOTAL}}']
    },
    {
      title: 'Justificativas & Notas',
      tags: ['{{MOTIVO_JUSTIFICATIVA}}', '{{OBSERVACOES}}']
    }
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-xl border border-slate-200/80">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-gradient-to-br from-blue-700 to-indigo-900 text-white p-3.5 rounded-2xl shadow-lg shadow-blue-900/20">
              <FileCode size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Modelos de Documento</h2>
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-blue-200">
                  Padrão Policlínica
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Personalize os templates HTML/CSS para emissão de <strong>Termos de Doação</strong> e <strong>Termos de Troca / Permuta</strong>.
                O PDF gerado obedece com precisão milimétrica às normas visuais e legais do Consórcio CPSMS e da Policlínica de Sobral.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setIssueType(activeTemplateType);
                setIssueTermNumber(`${Math.floor(Math.random() * 900 + 100)}/${new Date().getFullYear()}`);
                setShowIssueModal(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
            >
              <Plus size={15} />
              <span>Emitir Termo Avulso</span>
            </button>

            <button
              onClick={handleExportHtml}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
              title="Baixar arquivo HTML do template"
            >
              <Download size={15} />
              <span>Exportar HTML</span>
            </button>

            <button
              onClick={handleResetToDefault}
              className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
              title="Restaurar o modelo padrão oficial da Policlínica"
            >
              <RotateCcw size={15} />
              <span>Restaurar Padrão</span>
            </button>

            <button
              onClick={handleSaveTemplate}
              disabled={isSaving}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-700/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSaving ? 'Salvando...' : 'Salvar Modelo'}</span>
            </button>
          </div>
        </div>

        {/* SUB-TABS: DOAÇÃO vs TROCA */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-100/90 p-1.5 rounded-2xl">
            <button
              onClick={() => setActiveTemplateType('donation')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTemplateType === 'donation'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gift size={16} />
              <span>Termo de Doação</span>
            </button>

            <button
              onClick={() => setActiveTemplateType('exchange')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTemplateType === 'exchange'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft size={16} />
              <span>Termo de Troca / Permuta</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".html,.htm,.css,.txt"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Upload size={14} />
              <span>Carregar Arquivo ({editorMode.toUpperCase()})</span>
            </button>
          </div>
        </div>
      </div>

      {/* WORKSPACE: EDITOR & LIVE PREVIEW */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: CODE EDITOR (5 COLS) */}
        <div className="xl:col-span-6 bg-white rounded-3xl p-5 lg:p-6 shadow-xl border border-slate-200/80 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setEditorMode('html')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    editorMode === 'html'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  HTML Template
                </button>
                <button
                  onClick={() => setEditorMode('css')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    editorMode === 'css'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Estilos CSS (A4)
                </button>
              </div>
            </div>

            <span className="text-[11px] text-slate-400 font-medium">
              {editorMode === 'html' ? 'Estrutura & Conteúdo' : 'Estilização Visual A4'}
            </span>
          </div>

          {/* DYNAMIC VARIABLE TAG CHIPS */}
          <div className="space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" />
                Variáveis Dinâmicas (Clique para inserir no cursor):
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {variableCategories.flatMap(c => c.tags).map(tag => (
                <button
                  key={tag}
                  onClick={() => insertVariableTag(tag)}
                  className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-slate-200 hover:border-blue-300 rounded-md text-[10px] font-mono font-semibold transition-all shadow-2xs"
                  title={`Inserir ${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* TEXTAREA CODE EDITOR */}
          <div className="relative">
            <textarea
              ref={htmlEditorRef}
              rows={24}
              value={
                activeTemplateType === 'donation'
                  ? (editorMode === 'html' ? donationHtml : donationCss)
                  : (editorMode === 'html' ? exchangeHtml : exchangeCss)
              }
              onChange={(e) => {
                const val = e.target.value;
                if (activeTemplateType === 'donation') {
                  if (editorMode === 'html') setDonationHtml(val);
                  else setDonationCss(val);
                } else {
                  if (editorMode === 'html') setExchangeHtml(val);
                  else setExchangeCss(val);
                }
              }}
              className="w-full font-mono text-xs bg-slate-950 text-emerald-400 p-4 rounded-2xl border border-slate-800 shadow-inner focus:outline-hidden focus:ring-2 focus:ring-blue-600 resize-y leading-relaxed"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Dica: Use as tags <code className="text-blue-600 font-bold font-mono">{'{{NOME_TAG}}'}</code> para que os valores do termo sejam substituídos automaticamente.</span>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE A4 PREVIEW (6 COLS) */}
        <div className="xl:col-span-6 bg-white rounded-3xl p-5 lg:p-6 shadow-xl border border-slate-200/80 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Eye size={18} className="text-blue-600" />
              <h3 className="text-sm font-black text-slate-900">Pré-visualização do Documento (A4)</h3>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={previewDataSource}
                onChange={(e) => setPreviewDataSource(e.target.value as any)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700"
              >
                <option value="sample">Dados de Demonstração</option>
                <option value="real">Movimentação Real do Histórico</option>
              </select>

              {previewDataSource === 'real' && (
                <select
                  value={selectedRealTxId}
                  onChange={(e) => setSelectedRealTxId(e.target.value)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700 max-w-[150px]"
                >
                  <option value="">Selecione...</option>
                  {transactions
                    .filter(t => t.exitReason === 'doacao' || t.exitReason === 'troca')
                    .slice(0, 15)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.donationNumber || t.item_name.substring(0, 20)}
                      </option>
                    ))}
                </select>
              )}

              <button
                onClick={handlePrintTest}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Abrir janela de impressão do documento"
              >
                <Printer size={14} />
                <span>Imprimir</span>
              </button>

              <button
                onClick={handleDownloadPdfTest}
                disabled={isExportingPdf}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                title="Baixar arquivo PDF"
              >
                <Download size={14} />
                <span>{isExportingPdf ? 'Gerando...' : 'PDF'}</span>
              </button>
            </div>
          </div>

          {/* SIMULATED A4 PAPER SHEET */}
          <div className="bg-slate-200/70 p-4 rounded-2xl overflow-x-auto flex justify-center max-h-[750px] overflow-y-auto">
            <div 
              className="bg-white shadow-2xl rounded-sm transition-transform origin-top"
              style={{
                width: '794px',
                minHeight: '1123px',
                transform: `scale(${previewZoom / 100})`,
                transformOrigin: 'top center'
              }}
            >
              {/* RENDERED DOCUMENT CONTAINER */}
              <div 
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                className="p-2"
              />
            </div>
          </div>

          {/* PREVIEW CONTROLS */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Zoom do Preview:</span>
              <button 
                onClick={() => setPreviewZoom(Math.max(50, previewZoom - 10))}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-bold"
              >
                -
              </button>
              <span className="font-mono text-slate-700 font-bold">{previewZoom}%</span>
              <button 
                onClick={() => setPreviewZoom(Math.min(130, previewZoom + 10))}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-bold"
              >
                +
              </button>
              <button 
                onClick={() => setPreviewZoom(100)}
                className="px-2 py-0.5 text-[10px] text-blue-600 hover:underline"
              >
                100%
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Visualização idêntica à impressão A4 oficial</span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: EMITIR TERMO AVULSO */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 lg:p-8 shadow-2xl border border-slate-200 space-y-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 text-blue-700 p-2.5 rounded-2xl">
                  {issueType === 'donation' ? <Gift size={22} /> : <ArrowRightLeft size={22} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Emitir {issueType === 'donation' ? 'Termo de Doação' : 'Termo de Troca / Permuta'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gera o documento imediatamente utilizando o template oficial configurado
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowIssueModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Tipo de Termo
                  </label>
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="donation">Termo de Doação</option>
                    <option value="exchange">Termo de Troca / Permuta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Número do Termo
                  </label>
                  <input
                    type="text"
                    value={issueTermNumber}
                    onChange={(e) => setIssueTermNumber(e.target.value)}
                    placeholder="Ex: 015/2026"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Data de Emissão
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              {/* DADOS DA UNIDADE RECEPTORA / PARCEIRA */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 block">
                  {issueType === 'donation' ? 'Dados da Unidade Receptora (Donatário)' : 'Dados da Instituição Parceira (Permuta)'}
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Nome da Instituição / Unidade *
                    </label>
                    <input
                      type="text"
                      value={issueRecipientName}
                      onChange={(e) => setIssueRecipientName(e.target.value)}
                      placeholder="Ex: Hospital Municipal Dr. José Euclides"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      CNPJ / CPF
                    </label>
                    <input
                      type="text"
                      value={issueRecipientCnpj}
                      onChange={(e) => setIssueRecipientCnpj(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Endereço Completo
                    </label>
                    <input
                      type="text"
                      value={issueRecipientAddress}
                      onChange={(e) => setIssueRecipientAddress(e.target.value)}
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Responsável / Cargo
                    </label>
                    <input
                      type="text"
                      value={issueRecipientResponsible}
                      onChange={(e) => setIssueRecipientResponsible(e.target.value)}
                      placeholder="Nome completo e função"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Justificativa Administrativa / Técnica
                  </label>
                  <textarea
                    rows={2}
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                    placeholder="Descreva o motivo da doação ou permuta de materiais..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                  />
                </div>
              </div>

              {/* LISTA DE MATERIAIS CEDIDOS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                    {issueType === 'donation' ? 'Materiais Doados' : '1. Materiais Cedidos pela Policlínica'}
                  </span>
                  <button
                    onClick={() => setIssueItems([...issueItems, { name: '', quantity: 1, batch: '', expiry: '', unit: 'UN' }])}
                    className="text-xs text-blue-700 hover:text-blue-800 font-bold flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>Adicionar Item</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {issueItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...issueItems];
                            newItems[idx].name = e.target.value;
                            setIssueItems(newItems);
                          }}
                          placeholder="Descrição do material..."
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="text"
                          value={item.batch}
                          onChange={(e) => {
                            const newItems = [...issueItems];
                            newItems[idx].batch = e.target.value;
                            setIssueItems(newItems);
                          }}
                          placeholder="Lote"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="text"
                          value={item.expiry}
                          onChange={(e) => {
                            const newItems = [...issueItems];
                            newItems[idx].expiry = e.target.value;
                            setIssueItems(newItems);
                          }}
                          placeholder="Validade"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="w-16">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => {
                            const newItems = [...issueItems];
                            newItems[idx].unit = e.target.value;
                            setIssueItems(newItems);
                          }}
                          placeholder="UN"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...issueItems];
                            newItems[idx].quantity = parseFloat(e.target.value) || 1;
                            setIssueItems(newItems);
                          }}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center font-bold"
                        />
                      </div>
                      {issueItems.length > 1 && (
                        <button
                          onClick={() => setIssueItems(issueItems.filter((_, i) => i !== idx))}
                          className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* LISTA DE ITENS RECEBIDOS (SE FOR TROCA) */}
              {issueType === 'exchange' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      2. Materiais Recebidos em Contrapartida
                    </span>
                    <button
                      onClick={() => setIssueReceivedItems([...issueReceivedItems, { name: '', quantity: 1, batch: '', expiry: '', unit: 'UN' }])}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                    >
                      <Plus size={14} />
                      <span>Adicionar Item Recebido</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {issueReceivedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const newItems = [...issueReceivedItems];
                              newItems[idx].name = e.target.value;
                              setIssueReceivedItems(newItems);
                            }}
                            placeholder="Descrição do material recebido..."
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="text"
                            value={item.batch}
                            onChange={(e) => {
                              const newItems = [...issueReceivedItems];
                              newItems[idx].batch = e.target.value;
                              setIssueReceivedItems(newItems);
                            }}
                            placeholder="Lote"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                        <div className="w-24">
                          <input
                            type="text"
                            value={item.expiry}
                            onChange={(e) => {
                              const newItems = [...issueReceivedItems];
                              newItems[idx].expiry = e.target.value;
                              setIssueReceivedItems(newItems);
                            }}
                            placeholder="Validade"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                        <div className="w-16">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => {
                              const newItems = [...issueReceivedItems];
                              newItems[idx].unit = e.target.value;
                              setIssueReceivedItems(newItems);
                            }}
                            placeholder="UN"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center"
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...issueReceivedItems];
                              newItems[idx].quantity = parseFloat(e.target.value) || 1;
                              setIssueReceivedItems(newItems);
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center font-bold"
                          />
                        </div>
                        <button
                          onClick={() => setIssueReceivedItems(issueReceivedItems.filter((_, i) => i !== idx))}
                          className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {issueReceivedItems.length === 0 && (
                      <p className="text-xs text-slate-400 italic">Nenhum item recebido adicionado ainda.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowIssueModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleDirectIssue}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-700/20 flex items-center gap-2"
              >
                <Printer size={15} />
                <span>Emitir e Imprimir Termo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
