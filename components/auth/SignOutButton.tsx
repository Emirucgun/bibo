import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton({ label = "Çıkış yap" }: { label?: string }) {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" className="h-11 w-full text-sm">
        {label}
      </Button>
    </form>
  );
}
