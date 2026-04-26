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
}
