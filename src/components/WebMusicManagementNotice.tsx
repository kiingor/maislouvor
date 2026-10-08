import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function WebMusicManagementNotice({ open, onOpenChange, resource }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: "song" | "repertoire";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <Monitor className="h-8 w-8 text-primary" aria-hidden="true" />
        <DialogTitle>Continue pelo computador</DialogTitle>
        <DialogDescription>
          Para {resource === "repertoire" ? "criar um repertório" : "cadastrar ou editar uma música"},
          acesse o +Louvor no navegador do computador. A tela maior oferece mais espaço
          para organizar as informações{resource === "song" ? " e os arquivos" : ""}.
        </DialogDescription>
        <p className="rounded-xl bg-muted px-4 py-3 text-center font-medium">maislouvor.com</p>
        <p className="text-sm text-muted-foreground">
          Entre com a mesma conta de líder. Depois, tudo fica disponível no app para sua equipe.
        </p>
        <Button onClick={() => onOpenChange(false)}>Entendi</Button>
      </DialogContent>
    </Dialog>
  );
}
