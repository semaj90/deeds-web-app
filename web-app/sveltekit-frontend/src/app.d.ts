// See https://kit.svelte.dev/docs/types#app
import type { Session, User } from "$lib/types/user";

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      user: User | null;
      session: Session | null;
    }
    interface PageData {}
    interface Platform {}
  }
}

export {};
