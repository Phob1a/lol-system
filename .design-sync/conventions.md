# LoL System UI — conventions

A shadcn/ui component set (Radix primitives + Tailwind CSS, "new-york" style,
slate base). Style with **Tailwind utility classes**; brand color comes from a
small set of **semantic tokens** backed by CSS variables. No CSS-in-JS, no theme
prop — composition is plain JSX + `className`.

## Setup
- **No provider is required for styling.** The design tokens live in `:root`
  (and `.dark`) in the shipped stylesheet, so components are styled as soon as
  the stylesheet is loaded.
- **`<Form>`** is itself the form context (a thin wrapper over react-hook-form's
  `FormProvider`). Spread a `useForm()` result onto it: `<Form {...form}>`, then
  use `<FormField control={form.control} name="…" render={…} />`.
- **`<Toaster />`** is mounted once near the app root; call `toast(...)`
  (from sonner) to show messages.
- **Dark mode** is class-based: add `class="dark"` to a parent to flip every
  token.

## Styling idiom — semantic tokens (use these for brand consistency)
Each token is a `bg-*` / `text-*` / `border-*` utility. Pair a surface with its
`*-foreground`:

| Token | Utilities |
|---|---|
| Page | `bg-background` `text-foreground` |
| Primary action | `bg-primary` `text-primary-foreground` |
| Secondary | `bg-secondary` `text-secondary-foreground` |
| Destructive | `bg-destructive` `text-destructive-foreground` |
| Muted / subtle text | `bg-muted` `text-muted-foreground` |
| Accent (hover surfaces) | `bg-accent` `text-accent-foreground` |
| Card surface | `bg-card` `text-card-foreground` |
| Popover surface | `bg-popover` `text-popover-foreground` |
| Borders / inputs / focus ring | `border-border` `border-input` `ring-ring` |

Radii: `rounded-lg` / `rounded-md` / `rounded-sm` (derived from `--radius`).
Standard Tailwind utilities (`flex`, `grid`, `gap-*`, `p-*`, `text-sm`, …) are
available for layout. Prefer the tokens above over raw colors so light/dark and
rebranding stay consistent.

## Components
Actions & feedback: `Button` (variants: default · secondary · destructive ·
outline · ghost · link; sizes: sm · default · lg · icon), `Badge` (default ·
secondary · destructive · outline), `LoadingButtonContent` (spinner+text inside
a Button), `Toaster`.
Forms: `Input`, `Label`, `Checkbox`, `Select` (+ `SelectTrigger` `SelectValue`
`SelectContent` `SelectItem`), `Form` (+ `FormField` `FormItem` `FormLabel`
`FormControl` `FormDescription` `FormMessage`).
Layout & data: `Card` (+ `CardHeader` `CardTitle` `CardDescription` `CardContent`
`CardFooter`), `Separator`, `Tabs` (+ `TabsList` `TabsTrigger` `TabsContent`),
`Table` (+ `TableHeader` `TableBody` `TableRow` `TableHead` `TableCell`
`TableCaption`).
Overlays: `Dialog`, `AlertDialog`, `DropdownMenu` (each with its `*Trigger` /
`*Content` / header / item subcomponents).

## Where the truth lives
- Per-component props: each `<Name>.d.ts`. Usage: each `<Name>.prompt.md`.
- The exact token/utility vocabulary: the bound `styles.css` and its
  `@import`ed `_ds_bundle.css`.

## Idiomatic example
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge } from 'lol-system';

<Card className="w-[360px]">
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>Team Registration</CardTitle>
      <Badge variant="secondary">Group A</Badge>
    </div>
    <CardDescription>Sign up your roster for the Summer Split.</CardDescription>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">
    Five players plus an optional substitute.
  </CardContent>
  <CardFooter className="gap-2">
    <Button>Register team</Button>
    <Button variant="outline">Learn more</Button>
  </CardFooter>
</Card>
```
