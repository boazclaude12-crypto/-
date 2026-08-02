export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>CryptoAI</title>
    <style id="expo-reset">
      html, body { height: 100%; }
      body { overflow: hidden; }
      #root { display: flex; height: 100%; flex: 1; }
    </style>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script src="/_expo/static/js/web/index-7d645f068704e18c0690c9941a0e0182.js" defer></script>
  </body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
