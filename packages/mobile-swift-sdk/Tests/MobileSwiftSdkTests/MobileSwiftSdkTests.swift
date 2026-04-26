import XCTest
@testable import MobileSwiftSdk

final class MobileSwiftSdkTests: XCTestCase {
    func testBeginLoginReturnsAuthorizationURL() throws {
        let sdk = MobileSwiftSdk(
            issuer: "https://idp.example.com",
            clientId: "ios-client",
            redirectUri: "com.example.app:/oauth/callback"
        )

        let result = try sdk.beginLogin()

        XCTAssertTrue(result.authorizationURL.absoluteString.contains("response_type=code"))
        XCTAssertTrue(result.authorizationURL.absoluteString.contains("client_id=ios-client"))
    }

    func testLocalLogoutClearsLocalTokens() throws {
        let sdk = MobileSwiftSdk(
            issuer: "https://idp.example.com",
            clientId: "ios-client",
            redirectUri: "com.example.app:/oauth/callback"
        )
        var cleared = false

        let result = try sdk.logout(LogoutInput(mode: .local, clearLocalTokens: {
            cleared = true
        }))

        XCTAssertTrue(cleared)
        XCTAssertTrue(result.localTokensCleared)
        XCTAssertNil(result.logoutURL)
    }

    func testGlobalLogoutReturnsLogoutURLAfterClearingTokens() throws {
        let sdk = MobileSwiftSdk(
            issuer: "https://idp.example.com/",
            clientId: "ios-client",
            redirectUri: "com.example.app:/oauth/callback"
        )
        var cleared = false

        let result = try sdk.logout(LogoutInput(
            mode: .global,
            idTokenHint: "id-token",
            postLogoutRedirectUri: "com.example.app:/signed-out",
            state: "logout-state",
            clearLocalTokens: {
                cleared = true
            }
        ))

        XCTAssertTrue(cleared)
        XCTAssertEqual(
            result.logoutURL?.absoluteString,
            "https://idp.example.com/session/end?post_logout_redirect_uri=com.example.app:/signed-out&id_token_hint=id-token&state=logout-state"
        )
    }
}
