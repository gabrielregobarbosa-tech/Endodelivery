export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação. Tente novamente.');
  return data as T;
}

export async function sharePdf(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível gerar o PDF.');
  }
  const blob = await response.blob();
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    // Safari needs a fresh user gesture after the asynchronous PDF generation.
    // Prepare the file first, then share directly from this second button click.
    await new Promise<void>(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'pdf-share-dialog';
      dialog.setAttribute('aria-labelledby', 'pdf-share-title');
      const heading = document.createElement('h2');
      heading.id = 'pdf-share-title'; heading.textContent = 'Seu PDF está pronto';
      const description = document.createElement('p');
      description.textContent = 'Toque em compartilhar e escolha o WhatsApp ou outro aplicativo.';
      const actions = document.createElement('div'); actions.className = 'actions';
      const share = document.createElement('button'); share.className = 'button button-primary'; share.textContent = 'Compartilhar PDF';
      const download = document.createElement('a'); download.className = 'button button-secondary'; download.textContent = 'Baixar PDF';
      const close = document.createElement('button'); close.className = 'button button-ghost'; close.textContent = 'Concluir';
      const message = document.createElement('p'); message.className = 'field-hint'; message.setAttribute('role', 'status');
      const objectUrl = URL.createObjectURL(file);
      download.href = objectUrl; download.download = filename;
      share.onclick = () => {
        const sharing = navigator.share({ files: [file], title: filename.replace('.pdf', '') });
        share.disabled = true;
        sharing.then(() => dialog.close()).catch(error => {
          if ((error as Error).name !== 'AbortError') message.textContent = 'Não foi possível compartilhar. Você pode baixar o PDF e enviá-lo pelo aplicativo.';
        }).finally(() => { share.disabled = false; });
      };
      close.onclick = () => dialog.close();
      actions.append(share, download); dialog.append(heading, description, actions, message, close);
      dialog.addEventListener('close', () => { dialog.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000); resolve(); }, { once: true });
      document.body.append(dialog); dialog.showModal();
    });
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export interface Patient { id: string; name: string; referring_professional: string; birth_date: string; phone: string; notes: string; created_at: string; }
export interface Canal { name: string; odontometry: string; laf: string; }
export interface Visit { id: string; patient_id: string; attended_at: string; tooth: string; treatment: string; cement: string; irrigant: string; notes: string; canals: Canal[]; created_at: string; }
export interface Radiograph { id: string; caption: string; visit_id: string | null; created_at: string; }
export interface Appointment { id: string; patient_id: string | null; patient_name?: string; date: string; time: string; clinic: string; procedure: string; status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; }
export interface Template { id: string; title: string; kind: 'prescription' | 'post_op'; content: string; }
export interface DocumentRecord { id: string; title: string; kind: 'prescription' | 'post_op'; content: string; patient_id: string | null; created_at: string; }
