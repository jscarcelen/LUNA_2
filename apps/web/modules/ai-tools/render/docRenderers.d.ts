export function renderDocHtml(template: unknown, data?: unknown, options?: { showFieldMarkers?: boolean; prelaid?: unknown; highlight?: string[] }): string;
export function wrapDocHtml(fragment: string, options?: { forPrint?: boolean }): string;
export function renderDocPdfBuffer(template: unknown, data?: unknown, options?: { prelaid?: unknown }): Promise<Buffer>;
export function renderDocDocxBuffer(template: unknown, data?: unknown, options?: { prelaid?: unknown }): Promise<Buffer>;
export function renderDocPptxBuffer(template: unknown, data?: unknown, options?: { prelaid?: unknown }): Promise<Buffer>;
