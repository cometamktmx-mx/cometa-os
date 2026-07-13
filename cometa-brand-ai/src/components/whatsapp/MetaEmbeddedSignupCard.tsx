"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ConnectionStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "pending_review"
  | "active"
  | "paused"
  | "error"
  | "revoked";

type PillTone =
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "neutral";

type PreparationState =
  | "idle"
  | "preparing"
  | "ready"
  | "unavailable"
  | "error";

type PreparedSignup = {
  sessionId: string;
  state: string;
  signupType: "coexistence" | "cloud_api";
  appId: string;
  configId: string;
  graphApiVersion: string;
  expiresAt: string;
};

type StartSignupApiResponse = {
  ok?: boolean;
  ready?: boolean;
  code?: string;
  error?: string;

  brand?: {
    slug: string;
    name: string;
  };

  signup?: PreparedSignup;
};

type CompleteSignupApiResponse = {
  ok?: boolean;
  completed?: boolean;
  code?: string;
  error?: string;
  message?: string;

  connection?: {
    id?: string;
    status?: string;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    webhookStatus?: string;
    receiveEnabled?: boolean;
    agentEnabled?: boolean;
    realSendEnabled?: boolean;
  };
};

type FacebookLoginResponse = {
  status?: string;

  authResponse?: {
    code?: string;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
  };
};

type FacebookLoginOptions = {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;

  extras: {
    setup: Record<string, never>;
    featureType: "whatsapp_business_app_onboarding";
    sessionInfoVersion: "3";
  };
};

type FacebookSdk = {
  init: (options: {
    appId: string;
    cookie: boolean;
    xfbml: boolean;
    version: string;
  }) => void;

  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: FacebookLoginOptions
  ) => void;
};

type MetaWindow = Window & {
  FB?: FacebookSdk;
  fbAsyncInit?: () => void;
};

type MetaEmbeddedSignupMessage = {
  type?: string;
  event?: string;
  data?: Record<string, unknown>;
};

type EmbeddedSignupResult = {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  metaBusinessId: string | null;
};

type MetaEmbeddedSignupCardProps = {
  brandSlug: string;

  connectionStatus: ConnectionStatus;
  webhookStatus: string;
  realSendEnabled: boolean;

  statusLabel: string;
  statusTone: PillTone;

  loading: boolean;

  onCompleted: () => Promise<void>;
};

const META_SDK_SCRIPT_ID = "cometa-facebook-jssdk";

const META_ALLOWED_MESSAGE_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
]);

const RECONNECTABLE_STATUSES: ConnectionStatus[] = [
  "not_connected",
  "revoked",
  "error",
];

const MANAGED_STATUSES: ConnectionStatus[] = [
  "pending",
  "connected",
  "pending_review",
  "active",
  "paused",
];

let metaSdkLoadPromise: Promise<void> | null = null;
let initializedMetaAppId: string | null = null;

class MetaFlowError extends Error {
  code: string;

  constructor(message: string, code = "META_FLOW_ERROR") {
    super(message);

    this.name = "MetaFlowError";
    this.code = code;
  }
}

export default function MetaEmbeddedSignupCard({
  brandSlug,
  connectionStatus,
  webhookStatus,
  realSendEnabled,
  statusLabel,
  statusTone,
  loading,
  onCompleted,
}: MetaEmbeddedSignupCardProps) {
  const [preparationState, setPreparationState] =
    useState<PreparationState>("idle");

  const [preparedSignup, setPreparedSignup] =
    useState<PreparedSignup | null>(null);

  const [connecting, setConnecting] = useState(false);

  const [availabilityMessage, setAvailabilityMessage] =
    useState("");

  const [localMessage, setLocalMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const preparationRequestIdRef = useRef(0);

  const preparationInFlightRef = useRef<{
    brandSlug: string;
    promise: Promise<void>;
  } | null>(null);

  const activeBrandRef = useRef(brandSlug);

  useEffect(() => {
    activeBrandRef.current = brandSlug;
  }, [brandSlug]);

  const hasManagedConnection = useMemo(
    () => MANAGED_STATUSES.includes(connectionStatus),
    [connectionStatus]
  );

  const canLaunchEmbeddedSignup = useMemo(
    () => RECONNECTABLE_STATUSES.includes(connectionStatus),
    [connectionStatus]
  );

  const prepareSignup = useCallback((): Promise<void> => {
    const targetBrandSlug = String(brandSlug || "").trim();

    if (!targetBrandSlug) {
      setPreparationState("error");
      setLocalError("No hay una marca válida para conectar.");
      return Promise.resolve();
    }

    const currentPreparation =
      preparationInFlightRef.current;

    if (
      currentPreparation &&
      currentPreparation.brandSlug === targetBrandSlug
    ) {
      return currentPreparation.promise;
    }

    const requestId =
      preparationRequestIdRef.current + 1;

    preparationRequestIdRef.current = requestId;

    const promise = (async () => {
      try {
        setPreparationState("preparing");
        setPreparedSignup(null);
        setAvailabilityMessage("");
        setLocalError("");

        const response = await fetch(
          "/api/whatsapp/embedded-signup/start",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            cache: "no-store",

            body: JSON.stringify({
              brand: targetBrandSlug,
              signupType: "coexistence",
            }),
          }
        );

        const json = (await response
          .json()
          .catch(() => null)) as StartSignupApiResponse | null;

        const requestIsCurrent =
          requestId === preparationRequestIdRef.current &&
          activeBrandRef.current === targetBrandSlug;

        if (!requestIsCurrent) {
          return;
        }

        if (response.status === 409) {
          await onCompleted();
          return;
        }

        if (
          response.status === 503 ||
          json?.ready === false
        ) {
          setPreparationState("unavailable");

          setAvailabilityMessage(
            json?.error ||
              "Meta todavía no ha habilitado Embedded Signup para Cometa."
          );

          return;
        }

        if (!response.ok || !json || json.ok === false) {
          throw new MetaFlowError(
            json?.error ||
              "No se pudo preparar la conexión con Meta.",
            json?.code || "META_SIGNUP_START_FAILED"
          );
        }

        const signup = normalizePreparedSignup(json.signup);

        await loadFacebookSdk({
          appId: signup.appId,
          graphApiVersion: signup.graphApiVersion,
        });

        const stillCurrent =
          requestId === preparationRequestIdRef.current &&
          activeBrandRef.current === targetBrandSlug;

        if (!stillCurrent) {
          return;
        }

        setPreparedSignup(signup);
        setPreparationState("ready");

        setAvailabilityMessage(
          "La conexión segura con Meta está preparada."
        );
      } catch (error: unknown) {
        const requestIsCurrent =
          requestId === preparationRequestIdRef.current &&
          activeBrandRef.current === targetBrandSlug;

        if (!requestIsCurrent) {
          return;
        }

        console.error(
          "prepare Meta Embedded Signup:",
          error
        );

        setPreparationState("error");
        setPreparedSignup(null);
        setLocalError(getErrorMessage(error));
      }
    })().finally(() => {
      if (
        preparationInFlightRef.current?.promise === promise
      ) {
        preparationInFlightRef.current = null;
      }
    });

    preparationInFlightRef.current = {
      brandSlug: targetBrandSlug,
      promise,
    };

    return promise;
  }, [brandSlug, onCompleted]);

  useEffect(() => {
    if (
      loading ||
      !brandSlug ||
      !canLaunchEmbeddedSignup
    ) {
      preparationRequestIdRef.current += 1;
      setPreparedSignup(null);
      setPreparationState("idle");
      setAvailabilityMessage("");
      return;
    }

    void prepareSignup();
  }, [
    brandSlug,
    canLaunchEmbeddedSignup,
    loading,
    prepareSignup,
  ]);

  useEffect(() => {
    if (!preparedSignup?.expiresAt) {
      return;
    }

    const expiresAt =
      new Date(preparedSignup.expiresAt).getTime();

    if (!Number.isFinite(expiresAt)) {
      return;
    }

    const refreshAt =
      expiresAt - Date.now() - 60_000;

    const delay = Math.max(refreshAt, 1_000);

    const timer = window.setTimeout(() => {
      if (canLaunchEmbeddedSignup && !connecting) {
        void prepareSignup();
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    canLaunchEmbeddedSignup,
    connecting,
    prepareSignup,
    preparedSignup,
  ]);

  function startMetaConnection() {
    setLocalMessage("");
    setLocalError("");

    if (preparationState === "error") {
      void prepareSignup();
      return;
    }

    if (!preparedSignup) {
      setLocalError(
        "La conexión todavía no está preparada. Intenta nuevamente."
      );

      void prepareSignup();
      return;
    }

    const signup = preparedSignup;

    setPreparedSignup(null);
    setConnecting(true);

    let completedSuccessfully = false;

    let signupPromise: Promise<EmbeddedSignupResult>;

    try {
      /*
       * Esta función invoca FB.login inmediatamente dentro
       * del clic del usuario para evitar que el navegador
       * bloquee la ventana emergente.
       */
      signupPromise = launchMetaEmbeddedSignup({
        configId: signup.configId,
      });
    } catch (error: unknown) {
      setConnecting(false);
      setLocalError(getErrorMessage(error));
      void prepareSignup();
      return;
    }

    void (async () => {
      try {
        const result = await signupPromise;

        const response = await fetch(
          "/api/whatsapp/embedded-signup/complete",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            cache: "no-store",

            body: JSON.stringify({
              sessionId: signup.sessionId,
              state: signup.state,
              code: result.code,

              wabaId: result.wabaId,
              phoneNumberId: result.phoneNumberId,

              metaBusinessId:
                result.metaBusinessId || undefined,
            }),
          }
        );

        const json = (await response
          .json()
          .catch(() => null)) as CompleteSignupApiResponse | null;

        if (!response.ok || !json || json.ok === false) {
          throw new MetaFlowError(
            json?.error ||
              "No se pudo completar la conexión con Meta.",
            json?.code ||
              "META_SIGNUP_COMPLETE_FAILED"
          );
        }

        completedSuccessfully = true;

        setLocalMessage(
          json.message ||
            "WhatsApp quedó conectado y pendiente de revisión de Cometa."
        );

        await onCompleted();
      } catch (error: unknown) {
        console.error(
          "complete Meta Embedded Signup:",
          error
        );

        if (
          error instanceof MetaFlowError &&
          error.code === "META_SIGNUP_CANCELLED"
        ) {
          setLocalMessage(
            "El proceso de Meta fue cancelado. No se realizó ningún cambio."
          );
        } else {
          setLocalError(getErrorMessage(error));
        }
      } finally {
        setConnecting(false);

        if (
          !completedSuccessfully &&
          canLaunchEmbeddedSignup
        ) {
          void prepareSignup();
        }
      }
    })();
  }

  const title = getCardTitle({
    connectionStatus,
    preparationState,
  });

  const description = getCardDescription({
    connectionStatus,
    preparationState,
  });

  const buttonLabel = getButtonLabel({
    connectionStatus,
    preparationState,
    connecting,
    loading,
  });

  const buttonEnabled =
    !loading &&
    !connecting &&
    !hasManagedConnection &&
    (preparationState === "ready" ||
      preparationState === "error");

  const buttonClass =
    preparationState === "ready" &&
    !hasManagedConnection
      ? "border-[#081535] bg-[#081535] text-white hover:bg-[#08a9c6]"
      : preparationState === "error" &&
          !hasManagedConnection
        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08a9c6]">
            Conexión directa con Meta
          </p>

          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#081535]">
            {title}
          </h2>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#5b6a84]">
            {description}
          </p>
        </div>

        <div className="min-w-[230px]">
          <button
            type="button"
            onClick={startMetaConnection}
            disabled={!buttonEnabled}
            className={`inline-flex w-full items-center justify-center rounded-2xl border px-6 py-4 text-sm font-black transition disabled:cursor-not-allowed ${buttonClass}`}
          >
            {buttonLabel}
          </button>

          {preparationState === "ready" &&
          !hasManagedConnection ? (
            <p className="mt-3 text-center text-xs font-bold leading-5 text-[#718097]">
              Conservarás el mismo número en WhatsApp Business y en tu teléfono.
            </p>
          ) : null}

          {preparationState === "unavailable" &&
          !hasManagedConnection ? (
            <p className="mt-3 text-center text-xs font-bold leading-5 text-[#718097]">
              No necesitas realizar ninguna acción por ahora.
            </p>
          ) : null}
        </div>
      </div>

      {!hasManagedConnection &&
      preparationState === "ready" ? (
        <div className="mt-5 rounded-[22px] border border-cyan-200 bg-cyan-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#08a9c6] text-sm font-black text-white">
              ✓
            </span>

            <div>
              <p className="text-sm font-black text-cyan-900">
                Coexistence preparado
              </p>

              <p className="mt-1 text-xs font-semibold leading-5 text-cyan-800">
                Meta abrirá su flujo oficial para vincular el
                WhatsApp Business actual sin desconectarlo del
                teléfono.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!hasManagedConnection &&
      preparationState === "unavailable" ? (
        <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white">
              !
            </span>

            <div>
              <p className="text-sm font-black text-amber-900">
                Incorporación automática pendiente
              </p>

              <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                {availabilityMessage ||
                  "Meta continúa revisando la integración de Cometa."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {localMessage ? (
        <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {localMessage}
        </div>
      ) : null}

      {localError ? (
        <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {localError}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusPill
          label={statusLabel}
          tone={statusTone}
        />

        <StatusPill
          label={`Webhook: ${formatSimpleStatus(
            webhookStatus
          )}`}
          tone={
            webhookStatus === "active"
              ? "green"
              : "neutral"
          }
        />

        <StatusPill
          label={
            realSendEnabled
              ? "Envío real autorizado"
              : "Envío real bloqueado"
          }
          tone={
            realSendEnabled
              ? "red"
              : "neutral"
          }
        />
      </div>
    </section>
  );
}

function normalizePreparedSignup(
  signup: PreparedSignup | undefined
): PreparedSignup {
  if (
    !signup?.sessionId ||
    !signup.state ||
    !signup.appId ||
    !signup.configId ||
    !signup.graphApiVersion ||
    !signup.expiresAt
  ) {
    throw new MetaFlowError(
      "El servidor no devolvió una sesión completa de Meta.",
      "META_SIGNUP_SESSION_INVALID"
    );
  }

  return {
    sessionId: String(signup.sessionId),
    state: String(signup.state),

    signupType:
      signup.signupType === "cloud_api"
        ? "cloud_api"
        : "coexistence",

    appId: String(signup.appId),
    configId: String(signup.configId),

    graphApiVersion:
      String(signup.graphApiVersion),

    expiresAt: String(signup.expiresAt),
  };
}

function loadFacebookSdk({
  appId,
  graphApiVersion,
}: {
  appId: string;
  graphApiVersion: string;
}): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new MetaFlowError(
        "El SDK de Meta solamente puede cargarse en el navegador.",
        "META_SDK_BROWSER_REQUIRED"
      )
    );
  }

  const metaWindow =
    window as MetaWindow;

  if (
    initializedMetaAppId &&
    initializedMetaAppId !== appId
  ) {
    return Promise.reject(
      new MetaFlowError(
        "El SDK de Meta ya fue inicializado con otra aplicación.",
        "META_SDK_APP_MISMATCH"
      )
    );
  }

  if (metaWindow.FB) {
    initializeFacebookSdk({
      appId,
      graphApiVersion,
    });

    return Promise.resolve();
  }

  if (metaSdkLoadPromise) {
    return metaSdkLoadPromise.then(() => {
      initializeFacebookSdk({
        appId,
        graphApiVersion,
      });
    });
  }

  const promise = new Promise<void>(
    (resolve, reject) => {
      let settled = false;

      const finishWithSuccess = () => {
        if (settled) return;

        settled = true;
        window.clearTimeout(timeout);

        try {
          initializeFacebookSdk({
            appId,
            graphApiVersion,
          });

          resolve();
        } catch (error: unknown) {
          reject(error);
        }
      };

      const finishWithError = () => {
        if (settled) return;

        settled = true;
        window.clearTimeout(timeout);

        reject(
          new MetaFlowError(
            "No fue posible cargar el SDK oficial de Meta.",
            "META_SDK_LOAD_FAILED"
          )
        );
      };

      const timeout = window.setTimeout(
        finishWithError,
        20_000
      );

      const previousAsyncInit =
        metaWindow.fbAsyncInit;

      metaWindow.fbAsyncInit = () => {
        try {
          previousAsyncInit?.();
        } catch {
          // Conservamos la inicialización de Cometa.
        }

        finishWithSuccess();
      };

      const existingScript =
        document.getElementById(
          META_SDK_SCRIPT_ID
        ) as HTMLScriptElement | null;

      if (existingScript) {
        existingScript.addEventListener(
          "load",
          finishWithSuccess,
          {
            once: true,
          }
        );

        existingScript.addEventListener(
          "error",
          finishWithError,
          {
            once: true,
          }
        );

        if (metaWindow.FB) {
          finishWithSuccess();
        }

        return;
      }

      const script =
        document.createElement("script");

      script.id = META_SDK_SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";

      script.src =
        "https://connect.facebook.net/es_LA/sdk.js";

      script.addEventListener(
        "load",
        () => {
          /*
           * Normalmente fbAsyncInit se dispara automáticamente.
           * Este respaldo cubre navegadores donde FB ya esté listo.
           */
          if (metaWindow.FB) {
            finishWithSuccess();
          }
        },
        {
          once: true,
        }
      );

      script.addEventListener(
        "error",
        finishWithError,
        {
          once: true,
        }
      );

      document.head.appendChild(script);
    }
  );

  metaSdkLoadPromise = promise.catch(
    (error: unknown) => {
      metaSdkLoadPromise = null;
      throw error;
    }
  );

  return metaSdkLoadPromise;
}

function initializeFacebookSdk({
  appId,
  graphApiVersion,
}: {
  appId: string;
  graphApiVersion: string;
}) {
  const metaWindow =
    window as MetaWindow;

  if (!metaWindow.FB) {
    throw new MetaFlowError(
      "El SDK de Meta no está disponible.",
      "META_SDK_NOT_AVAILABLE"
    );
  }

  if (
    initializedMetaAppId &&
    initializedMetaAppId !== appId
  ) {
    throw new MetaFlowError(
      "El SDK de Meta ya utiliza otra aplicación.",
      "META_SDK_APP_MISMATCH"
    );
  }

  if (!initializedMetaAppId) {
    metaWindow.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: graphApiVersion,
    });

    initializedMetaAppId = appId;
  }
}

function launchMetaEmbeddedSignup({
  configId,
}: {
  configId: string;
}): Promise<EmbeddedSignupResult> {
  const metaWindow = window as MetaWindow;
const facebookSdk = metaWindow.FB;

if (!facebookSdk) {
  throw new MetaFlowError(
    "El SDK de Meta todavía no está listo.",
    "META_SDK_NOT_READY"
  );
}

return new Promise<EmbeddedSignupResult>(
    (resolve, reject) => {
      let settled = false;

      let exchangeCode: string | null =
        null;

      let sessionInformation: {
        wabaId: string;
        phoneNumberId: string;
        metaBusinessId: string | null;
      } | null = null;

      const cleanup = () => {
        window.removeEventListener(
          "message",
          receiveMessage
        );

        window.clearTimeout(timeout);
      };

      const rejectFlow = (
        error: MetaFlowError
      ) => {
        if (settled) return;

        settled = true;
        cleanup();
        reject(error);
      };

      const resolveWhenComplete = () => {
        if (
          settled ||
          !exchangeCode ||
          !sessionInformation
        ) {
          return;
        }

        settled = true;
        cleanup();

        resolve({
          code: exchangeCode,
          wabaId:
            sessionInformation.wabaId,

          phoneNumberId:
            sessionInformation.phoneNumberId,

          metaBusinessId:
            sessionInformation.metaBusinessId,
        });
      };

      const receiveMessage = (
        event: MessageEvent
      ) => {
        if (
          !META_ALLOWED_MESSAGE_ORIGINS.has(
            event.origin
          )
        ) {
          return;
        }

        const message =
          parseEmbeddedSignupMessage(
            event.data
          );

        if (
          !message ||
          message.type !==
            "WA_EMBEDDED_SIGNUP"
        ) {
          return;
        }

        const eventName =
          String(message.event || "")
            .trim()
            .toUpperCase();

        const data =
          isRecord(message.data)
            ? message.data
            : {};

        if (eventName === "FINISH") {
          const wabaId =
            getFirstString(data, [
              "waba_id",
              "wabaId",
            ]);

          const phoneNumberId =
            getFirstString(data, [
              "phone_number_id",
              "phoneNumberId",
            ]);

          const metaBusinessId =
            getFirstString(data, [
              "business_id",
              "businessId",
              "business_manager_id",
              "businessManagerId",
            ]) || null;

          if (!wabaId || !phoneNumberId) {
            rejectFlow(
              new MetaFlowError(
                "Meta finalizó sin devolver el número de WhatsApp seleccionado.",
                "META_SIGNUP_PHONE_MISSING"
              )
            );

            return;
          }

          sessionInformation = {
            wabaId,
            phoneNumberId,
            metaBusinessId,
          };

          resolveWhenComplete();
          return;
        }

        if (
          eventName ===
          "FINISH_ONLY_WABA"
        ) {
          rejectFlow(
            new MetaFlowError(
              "La cuenta de WhatsApp fue seleccionada, pero falta elegir o registrar un número.",
              "META_SIGNUP_PHONE_MISSING"
            )
          );

          return;
        }

        if (eventName === "CANCEL") {
          const currentStep =
            getFirstString(data, [
              "current_step",
              "currentStep",
            ]);

          rejectFlow(
            new MetaFlowError(
              currentStep
                ? `El proceso fue cancelado en el paso: ${currentStep}.`
                : "El proceso de Meta fue cancelado.",
              "META_SIGNUP_CANCELLED"
            )
          );

          return;
        }

        if (eventName === "ERROR") {
          const metaError =
            getFirstString(data, [
              "error_message",
              "errorMessage",
              "message",
            ]);

          rejectFlow(
            new MetaFlowError(
              metaError ||
                "Meta reportó un error durante la conexión.",
              "META_SIGNUP_REPORTED_ERROR"
            )
          );
        }
      };

      window.addEventListener(
        "message",
        receiveMessage
      );

      const timeout = window.setTimeout(
        () => {
          rejectFlow(
            new MetaFlowError(
              "La conexión con Meta tardó demasiado. Inicia nuevamente.",
              "META_SIGNUP_TIMEOUT"
            )
          );
        },
        15 * 60 * 1000
      );

      try {
        facebookSdk.login(
          (response) => {
            const code =
              String(
                response.authResponse?.code ||
                  ""
              ).trim();

            if (!code) {
              rejectFlow(
                new MetaFlowError(
                  "Meta no devolvió el código temporal de autorización.",
                  "META_SIGNUP_CODE_MISSING"
                )
              );

              return;
            }

            exchangeCode = code;
            resolveWhenComplete();
          },
          {
            config_id: configId,

            response_type: "code",

            override_default_response_type:
              true,

            extras: {
              setup: {},

              featureType:
                "whatsapp_business_app_onboarding",

              sessionInfoVersion: "3",
            },
          }
        );
      } catch (error: unknown) {
        rejectFlow(
          new MetaFlowError(
            getErrorMessage(error),
            "META_LOGIN_OPEN_FAILED"
          )
        );
      }
    }
  );
}

function parseEmbeddedSignupMessage(
  value: unknown
): MetaEmbeddedSignupMessage | null {
  let parsedValue = value;

  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsedValue)) {
    return null;
  }

  return parsedValue as MetaEmbeddedSignupMessage;
}

function getFirstString(
  row: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value =
      String(row[key] || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function getCardTitle({
  connectionStatus,
  preparationState,
}: {
  connectionStatus: ConnectionStatus;
  preparationState: PreparationState;
}) {
  if (connectionStatus === "active") {
    return "Tu WhatsApp está conectado";
  }

  if (
    connectionStatus === "pending" ||
    connectionStatus === "connected" ||
    connectionStatus === "pending_review"
  ) {
    return "Conexión enviada a revisión";
  }

  if (connectionStatus === "paused") {
    return "Tu conexión está pausada";
  }

  if (
    connectionStatus === "error" ||
    connectionStatus === "revoked"
  ) {
    return "Reconecta WhatsApp con Meta";
  }

  if (preparationState === "ready") {
    return "Conecta tu WhatsApp Business";
  }

  if (preparationState === "error") {
    return "No pudimos preparar Meta";
  }

  return "Alta de Meta en revisión";
}

function getCardDescription({
  connectionStatus,
  preparationState,
}: {
  connectionStatus: ConnectionStatus;
  preparationState: PreparationState;
}) {
  if (connectionStatus === "active") {
    return "Tu conexión continúa funcionando con los controles de seguridad de Cometa OS.";
  }

  if (
    connectionStatus === "pending" ||
    connectionStatus === "connected" ||
    connectionStatus === "pending_review"
  ) {
    return "Meta ya vinculó la cuenta. Cometa revisará la conexión antes de habilitar respuestas reales.";
  }

  if (connectionStatus === "paused") {
    return "El número permanece vinculado, pero su operación fue pausada desde el panel administrativo.";
  }

  if (
    connectionStatus === "error" ||
    connectionStatus === "revoked"
  ) {
    return "Vuelve a autorizar el número mediante el flujo oficial de Meta. Los envíos permanecerán bloqueados hasta la revisión.";
  }

  if (preparationState === "ready") {
    return "Conecta el mismo número que ya utilizas en WhatsApp Business y continúa viéndolo desde tu teléfono.";
  }

  if (preparationState === "error") {
    return "Ocurrió un problema al preparar el SDK o la sesión segura. Puedes volver a intentarlo.";
  }

  return "Cometa ya envió a Meta la verificación necesaria para habilitar la conexión automática de WhatsApp.";
}

function getButtonLabel({
  connectionStatus,
  preparationState,
  connecting,
  loading,
}: {
  connectionStatus: ConnectionStatus;
  preparationState: PreparationState;
  connecting: boolean;
  loading: boolean;
}) {
  if (loading) {
    return "Consultando estado...";
  }

  if (connecting) {
    return "Conectando con Meta...";
  }

  if (connectionStatus === "active") {
    return "Conexión administrada";
  }

  if (
    connectionStatus === "pending" ||
    connectionStatus === "connected" ||
    connectionStatus === "pending_review"
  ) {
    return "Pendiente de revisión";
  }

  if (connectionStatus === "paused") {
    return "Conexión pausada";
  }

  if (preparationState === "preparing") {
    return "Preparando conexión...";
  }

  if (preparationState === "ready") {
    return connectionStatus === "error" ||
      connectionStatus === "revoked"
      ? "Reconectar con Meta"
      : "Conectar con Meta";
  }

  if (preparationState === "error") {
    return "Reintentar preparación";
  }

  return "Meta en revisión";
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: PillTone;
}) {
  const toneClass = {
    green:
      "bg-emerald-100 text-emerald-700",

    yellow:
      "bg-amber-100 text-amber-700",

    red:
      "bg-red-100 text-red-700",

    blue:
      "bg-blue-100 text-blue-700",

    neutral:
      "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function formatSimpleStatus(
  value: string | null | undefined
) {
  const status =
    String(value || "")
      .trim()
      .toLowerCase();

  if (status === "active") {
    return "Activo";
  }

  if (status === "pending") {
    return "Pendiente";
  }

  if (status === "error") {
    return "Error";
  }

  if (status === "disabled") {
    return "Desactivado";
  }

  if (status === "not_connected") {
    return "No conectado";
  }

  return status || "No disponible";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return (
      error.message ||
      "Ocurrió un error inesperado."
    );
  }

  return "Ocurrió un error inesperado.";
}