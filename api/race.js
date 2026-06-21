export default async function handler(req, res) {
  const place = String(req.query.place || "");
  const race = String(req.query.race || "");

  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    status: "ok",
    place,
    race,
    officialText: ""
  });
}
