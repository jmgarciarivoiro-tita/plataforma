// P2: la plataforma solo conoce esta interfaz; el IdP concreto (Google hoy, Workspace mañana) es un adaptador.

/** Identidad devuelta por el IdP después de validar el login. */
export interface IdentidadExterna {
  sub: string;
  email: string | null;
  emailVerificado: boolean;
  nombre: string | null;
  /** Dominio de Google Workspace (claim `hd`); null en cuentas personales. */
  dominio: string | null;
}

export interface ParametrosLogin {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface ChequeosCallback {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface ProveedorIdentidad {
  /** URL del IdP a la que se redirige al usuario. */
  urlLogin(p: ParametrosLogin): Promise<URL>;
  /** Canjea el código, valida state/nonce/PKCE y el ID token. Lanza error si algo no valida. */
  completarLogin(urlCallback: URL, chequeos: ChequeosCallback): Promise<IdentidadExterna>;
}
