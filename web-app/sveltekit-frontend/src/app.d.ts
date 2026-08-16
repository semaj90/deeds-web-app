// See https://kit.svelte.dev/docs/types#app
import type { User, UserSession } from "$lib/types/user";

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      user: User | null;
      session: UserSession | null;
    }
    interface PageData {}
    interface Platform {}
  }
}

export {};
