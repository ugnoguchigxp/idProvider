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

public enum LogoutMode {
    case local
    case global
}

public struct LogoutInput {
    public let mode: LogoutMode
    public let idTokenHint: String?
    public let postLogoutRedirectUri: String?
    public let state: String?
    public let clearLocalTokens: () -> Void

    public init(
        mode: LogoutMode,
        idTokenHint: String? = nil,
        postLogoutRedirectUri: String? = nil,
        state: String? = nil,
        clearLocalTokens: @escaping () -> Void
    ) {
        self.mode = mode
        self.idTokenHint = idTokenHint
        self.postLogoutRedirectUri = postLogoutRedirectUri
        self.state = state
        self.clearLocalTokens = clearLocalTokens
    }
}

public struct LogoutResult {
    public let localTokensCleared: Bool
    public let logoutURL: URL?
    public let warnings: [String]
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

    public func createLogoutURL(
        postLogoutRedirectUri: String? = nil,
        idTokenHint: String? = nil,
        state: String? = nil
    ) throws -> URL {
        var components = URLComponents(string: issuer.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/session/end")
        var items: [URLQueryItem] = []
        if let postLogoutRedirectUri, !postLogoutRedirectUri.isEmpty {
            items.append(URLQueryItem(name: "post_logout_redirect_uri", value: postLogoutRedirectUri))
        }
        if let idTokenHint, !idTokenHint.isEmpty {
            items.append(URLQueryItem(name: "id_token_hint", value: idTokenHint))
        }
        if let state, !state.isEmpty {
            items.append(URLQueryItem(name: "state", value: state))
        }
        components?.queryItems = items.isEmpty ? nil : items
        guard let url = components?.url else {
            throw NSError(domain: "MobileSwiftSdk", code: 4, userInfo: [NSLocalizedDescriptionKey: "invalid logout url"])
        }
        return url
    }

    public func logout(_ input: LogoutInput) throws -> LogoutResult {
        input.clearLocalTokens()
        let logoutURL: URL?
        switch input.mode {
        case .local:
            logoutURL = nil
        case .global:
            logoutURL = try createLogoutURL(
                postLogoutRedirectUri: input.postLogoutRedirectUri,
                idTokenHint: input.idTokenHint,
                state: input.state
            )
        }
        return LogoutResult(localTokensCleared: true, logoutURL: logoutURL, warnings: [])
    }
}
