// useForm is imported from 'lol-system' (not 'react-hook-form') on purpose:
// react-hook-form is merged into the shipped bundle via cfg.extraEntries, so
// this useForm shares the SAME react-hook-form instance as <Form> / <FormField>.
// Importing it from 'react-hook-form' here would bundle a second copy and the
// form context would not match.
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  Input,
  Button,
  useForm,
} from 'lol-system';

export function Default() {
  const form = useForm({ defaultValues: { summoner: 'Faker', email: '' } });
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(() => {})}
        style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <FormField
          control={form.control}
          name="summoner"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Summoner name</FormLabel>
              <FormControl>
                <Input placeholder="Faker" {...field} />
              </FormControl>
              <FormDescription>Your in-game name, exactly as registered.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Contact email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Register team</Button>
      </form>
    </Form>
  );
}
