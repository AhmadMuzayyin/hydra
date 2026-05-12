"use client";

import { useActionState } from "react";
import { Droplets } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function LoginClient() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--gradient-hero)] px-5">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-[var(--shadow-elevated)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-card)]">
            <Droplets className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Hydra</h1>
          <p className="text-sm text-muted-foreground">Hybrid Dynamic Remote Aqua-monitoring</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" defaultValue="admin" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button className="h-12 w-full text-base" type="submit" disabled={pending}>
            {pending ? "Memproses..." : "Masuk"}
          </Button>
        </form>
      </div>
    </div>
  );
}
