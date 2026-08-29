# Cloudflare Workers(ADR-007/ADR-008)規約

- Service Binding(`env.<BINDING>.fetch(...)`)には、Next.jsのRoute Handler等
  フレームワーク由来のRequestオブジェクト(NextRequest等)をそのまま渡さない。
  Service Binding呼び出しの直前に、url/method/headers/bodyのみを転送する
  `new Request(url, init)`で素のRequestを明示的に再構築してから渡すこと
  (非GETは`duplex: "half"`を付与)。フレームワーク由来のオブジェクトを
  そのまま渡すと`new URL(request)`相当の変換に失敗し、`TypeError: Invalid
  URL: [object Object]`で本番500エラーになる実例がある(詳細: STATUS.md
  2026-07-25)。
- worker-app↔worker-api間のService Bindingを検証するMiniflareテストは、
  素のRequestスタブだけでなく、実際にNext.jsのRoute Handlerを経由した
  Requestオブジェクト(またはそれと同型のフレームワーク由来オブジェクト)
  でも疎通確認を行うこと。素のRequestスタブのみのテストは上記の本番固有の
  Requestアイデンティティ問題を検出できない。
