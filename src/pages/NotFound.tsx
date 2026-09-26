import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass } from "lucide-react";

/** Rota inexistente: estado vazio do iOS ("conteúdo indisponível") sobre o fundo agrupado. */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)] text-foreground">
      <div className="w-full max-w-sm text-center animate-in-up">
        <Compass className="mx-auto h-14 w-14 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <h1 className="mt-5 text-large-title">404</h1>
        <p className="mt-1 text-body text-muted-foreground">Oops! Page not found</p>
        {/* <a> de propósito: recarrega a partir de "/", que decide o destino (login ou app). */}
        <a
          href="/"
          className="mt-8 flex h-[50px] w-full items-center justify-center rounded-full bg-prominent px-5 text-headline text-prominent-foreground transition-transform active:scale-[0.98]"
        >
          Return to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
