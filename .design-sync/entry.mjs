// Scoped design-system entry for /design-sync.
// Re-exports ONLY the shadcn `ui` primitives (src/components/ui) so esbuild
// bundles a focused window.LolSystemUI namespace — not the whole Next.js app.
// All compound subcomponents (CardHeader, DialogContent, SelectItem, …) come
// along via `export *`, so previews can compose them even though only the
// 16 primary components get cards (see cfg.componentSrcMap).
export * from '../src/components/ui/alert-dialog';
export * from '../src/components/ui/badge';
export * from '../src/components/ui/button';
export * from '../src/components/ui/card';
export * from '../src/components/ui/checkbox';
export * from '../src/components/ui/dialog';
export * from '../src/components/ui/dropdown-menu';
export * from '../src/components/ui/form';
export * from '../src/components/ui/input';
export * from '../src/components/ui/label';
export * from '../src/components/ui/loading-button-content';
export * from '../src/components/ui/select';
export * from '../src/components/ui/separator';
export * from '../src/components/ui/sonner';
export * from '../src/components/ui/table';
export * from '../src/components/ui/tabs';
