import { signInWithGoogle } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function GoogleButton() {
  return (
    <form action={signInWithGoogle}>
      <Button type="submit" className="h-12 w-full text-base">
        Google ile devam et
      </Button>
    </form>
  );
}
