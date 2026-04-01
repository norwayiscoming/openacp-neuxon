export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NEUXON — AI Journey Graph</title>
</head>
<body style="background:#0a0e14;color:#e0e0e0;font-family:system-ui,sans-serif;">
<canvas id="graph"></canvas>
<h1 style="color:#00ff41;text-align:center;margin-top:40vh;">NEUXON</h1>
<p style="text-align:center;color:#8b949e;">Loading graph...</p>
<script>
const params = new URLSearchParams(location.search);
const sessionId = params.get('sessionId');
if (sessionId) {
  fetch('/api/graph/' + sessionId)
    .then(r => r.json())
    .then(graph => {
      document.querySelector('p').textContent =
        graph.nodes ? graph.nodes.length + ' nodes loaded' : 'No graph found';
    })
    .catch(() => {
      document.querySelector('p').textContent = 'Waiting for session...';
    });
}
</script>
</body>
</html>`;
}
