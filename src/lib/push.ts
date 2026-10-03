import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// Chave pública VAPID (pode ser pública). A privada fica só no servidor (edge function send-push).
const VAPID_PUBLIC_KEY =
  "BHPC_L0uJ98IDISq41X_QyeFHRw9JDWKu8ey8rz2vfrxoxCb-sqy_cAfJsnFmbf4Am6x_XC6GykACC9gnUCfXsg";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Web Push só funciona no navegador/PWA (não na WebView nativa, que usa FCM). */
export function pushSupported(): boolean {
  return (
    !Capacitor.isNativePlatform() &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON() as any;
  if (!json.keys?.p256dh || !json.keys?.auth) return;
  await (supabase as any).rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
}

/** Pede permissão e assina o push neste aparelho. */
export async function enablePushOnThisDevice(): Promise<
  "granted" | "denied" | "unsupported" | "error"
> {
  if (!pushSupported()) return "unsupported";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(sub);
    return "granted";
  } catch (e) {
    console.error("enablePush error", e);
    return "error";
  }
}

export interface PushRecipient {
  profile_id: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Dispara o push (Web Push) para uma lista de destinatários via edge function.
 * Chamado logo após inserir as notificações in-app. À prova de falha: se algo der
 * errado, a notificação in-app continua valendo.
 *
 * chatReportId: denúncia que a pessoa acabou de enviar. O send-push também avisa
 * os administradores da plataforma (o servidor confere e escolhe quem; o app não
 * sabe quem administra), mesmo sem liderança para avisar.
 */
export async function firePush(
  teamId: string,
  recipients: PushRecipient[],
  options: { chatReportId?: string } = {},
): Promise<void> {
  if (!recipients.length && !options.chatReportId) return;
  try {
    await supabase.functions.invoke("send-push", {
      body: { team_id: teamId, recipients, ...(options.chatReportId ? { chat_report_id: options.chatReportId } : {}) },
    });
  } catch (e) {
    console.warn("firePush falhou (push opcional):", e);
  }
}

/** Se a permissão já foi concedida, garante a assinatura salva (chamar ao logar/abrir). */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(sub);
  } catch {
    /* ignore */
  }
}

// ===== Push nativo (Android via FCM / @capacitor/push-notifications) =====
let nativeRegistered = false;

/**
 * Registra o push nativo (FCM) no app Android: pede permissão, registra e salva
 * o token FCM. `onOpen` é chamado quando o usuário toca numa notificação.
 */
export async function registerNativePush(onOpen?: (link: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    if (!nativeRegistered) {
      nativeRegistered = true;
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      await PushNotifications.addListener("registration", async (token) => {
        // Não fixar "android": no iOS este mesmo callback entrega um token APNs,
        // que precisa ser gravado e enviado por outro caminho. getPlatform()
        // devolve "ios" | "android" | "web".
        await (supabase as any).rpc("save_device_token", {
          p_token: token.value,
          p_platform: Capacitor.getPlatform(),
        });
      });
      await PushNotifications.addListener("registrationError", (err) => {
        console.error("FCM registration error", err);
      });
      // Tocar na notificação do FCM (app em background/fechado) → abre a tela.
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const link = (action.notification?.data as any)?.link || "/app/home";
        if (onOpen) onOpen(link);
      });
      // App em FOREGROUND: o Android não mostra o FCM na bandeja → exibimos local.
      await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
        try {
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 2000000000),
              title: notification.title || "+Louvor",
              body: notification.body || "",
              smallIcon: "ic_stat_notify",
              extra: { link: (notification.data as any)?.link || "/app/home" },
            }],
          });
        } catch (e) {
          console.error("local notification error", e);
        }
      });
      // Tocar na notificação local (mostrada em foreground) → abre a tela.
      await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        const link = (action.notification.extra as any)?.link || "/app/home";
        if (onOpen) onOpen(link);
      });
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
  } catch (e) {
    console.error("registerNativePush error", e);
  }
}
