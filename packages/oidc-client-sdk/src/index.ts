export type OidcClientTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
};
