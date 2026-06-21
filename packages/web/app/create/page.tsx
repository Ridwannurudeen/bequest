import type { Metadata } from "next";
import {
  ConsoleShell,
  Stepper,
  WorkspaceHeader,
} from "../../components/benchmark-ui";
import { OwnerSetup } from "../../components/owner-setup";

export const metadata: Metadata = {
  title: "Bequest · create estate",
  description:
    "Create a Sui estate, choose recipients, set a trigger, and keep an encrypted letter sealed until release.",
};

export default function CreateEstatePage() {
  return (
    <ConsoleShell active="recipients">
      <WorkspaceHeader
        title="Create your estate"
        body="A guided setup. You can change or cancel everything while the estate is Active."
        pill="Active"
      />
      <Stepper active={1} />

      <OwnerSetup />
    </ConsoleShell>
  );
}
