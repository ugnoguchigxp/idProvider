import Foundation

public struct BeginLoginResult {
    public let authorizationURL: URL
    public let state: String
    public let nonce: String
    public let codeVerifier: String
}

public struct TokenResult {
    public let accessToken: String
    public let idToken: String?
    public let refreshToken: String?
    public let expiresIn: Int
}

public final class MobileSwiftSdk {
    private let issuer: String
    private let clientId: String
    private let redirectUri: String

    public init(issuer: String, clientId: String, redirectUri: String) {
        self.issuer = issuer
        self.clientId = clientId
        self.redirectUri = redirectUri
    }

    public func beginLogin() throws -> BeginLoginResult {
        let state = "state-placeholder"
        let nonce = "nonce-placeholder"
        let verifier = "code-verifier-placeholder"
        let encodedRedirect = redirectUri.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? redirectUri
        let raw = "\(issuer)/auth?client_id=\(clientId)&response_type=code&redirect_uri=\(encodedRedirect)&scope=openid%20profile%20email&state=\(state)&nonce=\(nonce)"
        guard let url = URL(string: raw) else {
            throw NSError(domain: "MobileSwiftSdk", code: 1, userInfo: [NSLocalizedDescriptionKey: "invalid authorization url"])
        }
        return BeginLoginResult(authorizationURL: url, state: state, nonce: nonce, codeVerifier: verifier)
    }

    public func exchangeCode(code: String, codeVerifier: String) throws -> TokenResult {
        guard !code.isEmpty else {
            throw NSError(domain: "MobileSwiftSdk", code: 2, userInfo: [NSLocalizedDescriptionKey: "code is required"])
        }
        guard !codeVerifier.isEmpty else {
            throw NSError(domain: "MobileSwiftSdk", code: 3, userInfo: [NSLocalizedDescriptionKey: "codeVerifier is required"])
        }
        return TokenResult(accessToken: "access-token-placeholder", idToken: "id-token-placeholder", refreshToken: "refresh-token-placeholder", expiresIn: 300)
    }
}
