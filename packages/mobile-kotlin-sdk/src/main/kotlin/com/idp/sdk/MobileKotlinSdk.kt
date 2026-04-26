package com.idp.sdk

data class BeginLoginResult(
  val authorizationUrl: String,
  val state: String,
  val nonce: String,
  val codeVerifier: String,
)

data class TokenResult(
  val accessToken: String,
  val idToken: String?,
  val refreshToken: String?,
  val expiresIn: Int,
)

enum class LogoutMode {
  LOCAL,
  GLOBAL,
}

data class LogoutInput(
  val mode: LogoutMode,
  val idTokenHint: String? = null,
  val postLogoutRedirectUri: String? = null,
  val state: String? = null,
  val clearLocalTokens: () -> Unit,
)

data class LogoutResult(
  val localTokensCleared: Boolean,
  val logoutUrl: String?,
  val warnings: List<String> = emptyList(),
)

class MobileKotlinSdk(
  private val issuer: String,
  private val clientId: String,
  private val redirectUri: String,
) {
  fun beginLogin(): BeginLoginResult {
    // MVP: 認可URL組み立てだけ提供（交換処理は次フェーズ）
    val state = "state-placeholder"
    val nonce = "nonce-placeholder"
    val verifier = "code-verifier-placeholder"
    val url = "$issuer/auth?client_id=$clientId&response_type=code&redirect_uri=$redirectUri&scope=openid%20profile%20email&state=$state&nonce=$nonce"
    return BeginLoginResult(url, state, nonce, verifier)
  }

  fun exchangeCode(code: String, codeVerifier: String): TokenResult {
    require(code.isNotBlank()) { "code is required" }
    require(codeVerifier.isNotBlank()) { "codeVerifier is required" }
    return TokenResult(
      accessToken = "access-token-placeholder",
      idToken = "id-token-placeholder",
      refreshToken = "refresh-token-placeholder",
      expiresIn = 300,
    )
  }

  fun createLogoutUrl(
    postLogoutRedirectUri: String? = null,
    idTokenHint: String? = null,
    state: String? = null,
  ): String {
    val params = mutableListOf<String>()
    if (!postLogoutRedirectUri.isNullOrBlank()) {
      params.add("post_logout_redirect_uri=${encode(postLogoutRedirectUri)}")
    }
    if (!idTokenHint.isNullOrBlank()) {
      params.add("id_token_hint=${encode(idTokenHint)}")
    }
    if (!state.isNullOrBlank()) {
      params.add("state=${encode(state)}")
    }
    val suffix = if (params.isEmpty()) "" else "?${params.joinToString("&")}"
    return "${issuer.trimEnd('/')}/session/end$suffix"
  }

  fun logout(input: LogoutInput): LogoutResult {
    input.clearLocalTokens()
    val logoutUrl = when (input.mode) {
      LogoutMode.LOCAL -> null
      LogoutMode.GLOBAL -> createLogoutUrl(
        postLogoutRedirectUri = input.postLogoutRedirectUri,
        idTokenHint = input.idTokenHint,
        state = input.state,
      )
    }
    return LogoutResult(localTokensCleared = true, logoutUrl = logoutUrl)
  }

  private fun encode(value: String): String =
    java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
}
