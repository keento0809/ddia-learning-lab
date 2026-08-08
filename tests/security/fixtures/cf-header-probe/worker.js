export default {
  async fetch(request) {
    const h = request.headers;
    return new Response(
      JSON.stringify({
        cfConnectingIp: h.get("cf-connecting-ip"),
        xForwardedFor: h.get("x-forwarded-for"),
      }),
      { headers: { "content-type": "application/json" } },
    );
  },
};
