export interface AttachmentRef {
  fileId: string;
  path: string;
  filename: string;
  relativePath?: string;
  mimeType?: string;
  size?: number;
  textPreview?: string;
}

function toolHintForFilename(filename: string): string | null {
  const ext = filename.includes('.') ? `.${filename.split('.').pop()!.toLowerCase()}` : '';
  switch (ext) {
    case '.pdf':
      return 'read_pdf';
    case '.docx':
    case '.doc':
      return 'read_docx';
    case '.xlsx':
    case '.xls':
      return 'read_xlsx';
    case '.pptx':
      return 'read_pptx';
    case '.txt':
    case '.md':
    case '.csv':
      return 'read_file';
    default:
      return null;
  }
}

function workspacePath(ref: AttachmentRef): string {
  return ref.relativePath ?? ref.path;
}

export function buildUserMessageWithAttachments(
  message: string,
  attachments?: AttachmentRef[],
): string {
  if (!attachments?.length) return message;

  const lines = attachments.map((a) => {
    const wsPath = workspacePath(a);
    const tool = toolHintForFilename(a.filename);
    const toolPart = tool ? `. Use ${tool} with path "${wsPath}" to read it` : '';
    const previewPart = a.textPreview ? `\n  Preview: ${a.textPreview}` : '';
    return `- ${a.filename} (workspace path: ${wsPath})${toolPart}${previewPart}`;
  });

  return `${message.trim()}\n\n[User attached files]\n${lines.join('\n')}\n\nUse the appropriate workspace file tools to read attached documents before answering.`;
}

export function attachmentMetadata(attachments?: AttachmentRef[]): Record<string, unknown> | undefined {
  if (!attachments?.length) return undefined;
  return {
    attachments: attachments.map((a) => ({
      fileId: a.fileId,
      filename: a.filename,
      path: a.path,
      relativePath: a.relativePath ?? a.path,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}
