export default async function handler(req, res) {
  const { unique } = req.query;

  if (!unique) {
    return res.status(400).json({ error: "يرجى إدخال الرقم الموحد." });
  }

  try {
    const response = await fetch(`http://176.241.95.201:8092/id?unique=${encodeURIComponent(unique)}`, {
      method: 'GET',
      headers: {
        Authorization: 'Basic YWRtaW46MjQxMDY3ODkw',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `السيرفر رد بحالة ${response.status}` });
    }

    const data = await response.json();

    // حذف رابط الصورة حسب طلبك (إذا موجود)
    if (data.trips && Array.isArray(data.trips)) {
      data.trips.forEach(trip => {
        if (trip.sonarData && trip.sonarData.manifests) {
          trip.sonarData.manifests.forEach(manifest => {
            if ('sonar_image_url' in manifest) {
              delete manifest.sonar_image_url;
            }
          });
        }
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "خطأ في الاتصال بالسيرفر الخارجي", details: err.message });
  }
}
