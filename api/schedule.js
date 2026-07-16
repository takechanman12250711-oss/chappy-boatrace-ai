// api/schedule.js
// 公式「本日のレース」から開催場を取得し、
// 各場の1R〜12Rの締切予定時刻を返す。

const OFFICIAL_BASE =
  "https://www.boatrace.jp";

const PLACE_NAMES = {
  "01": "桐生",
  "02": "戸田",
  "03": "江戸川",
  "04": "平和島",
  "05": "多摩川",
  "06": "浜名湖",
  "07": "蒲郡",
  "08": "常滑",
  "09": "津",
  "10": "三国",
  "11": "びわこ",
  "12": "住之江",
  "13": "尼崎",
  "14": "鳴門",
  "15": "丸亀",
  "16": "児島",
  "17": "宮島",
  "18": "徳山",
  "19": "下関",
  "20": "若松",
  "21": "芦屋",
  "22": "福岡",
  "23": "唐津",
  "24": "大村"
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#([0-9]+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    );
}

function stripHtml(html) {
  return decodeHtml(
    String(html || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getJstDateText(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "ja-JP",
      {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(date);

  const byType =
    Object.fromEntries(
      parts.map(part => [
        part.type,
        part.value
      ])
    );

  return (
    byType.year +
    byType.month +
    byType.day
  );
}

function parseVenues(
  indexHtml,
  date,
  nowMs
) {
  const venues = [];
  const seen = new Set();

  const blocks =
    String(indexHtml || "").match(
      /<tbody[\s\S]*?<\/tbody>/gi
    ) || [];

  blocks.forEach(block => {
    const venueMatch = block.match(
      /text_place1_(\d{2})\.png[\s\S]{0,250}?alt="([^"]+)"/i
    );

    if (!venueMatch) return;

    const jcd =
      String(venueMatch[1]);

    if (seen.has(jcd)) return;

    seen.add(jcd);

        const text =
      stripHtml(block);

    const gradeMatch =
      block.match(
        /\bis-(SG|PG1|G1|G2|G3|ippan)b?\b/i
      );

    const gradeKey =
      gradeMatch
        ? String(
            gradeMatch[1]
          )
        : "";

    const eventGrade =
      gradeKey.toLowerCase() ===
      "ippan"
        ? "一般"
        : gradeKey.toUpperCase();

    const eventMatch =
      block.match(
        /raceindex\?jcd=\d{2}&(?:amp;)?hd=\d{8}"[^>]*>([\s\S]*?)<\/a>/i
      );

    const eventTitle =
      eventMatch
        ? stripHtml(
            eventMatch[1]
          )
        : "";

    const raceMatch = block.match(
      new RegExp(
        `racelist\\?rno=(\\d+)` +
        `&(?:amp;)?jcd=${jcd}`,
        "i"
      )
    );

    const timeMatch = text.match(
      /\b(\d{1,2}:\d{2})\b/
    );

    const currentRaceNo =
      raceMatch
        ? Number(raceMatch[1])
        : 0;

    const nextDeadline =
      timeMatch
        ? timeMatch[1]
        : "";

    const deadlineAt =
      nextDeadline
        ? createDeadlineAt(
            date,
            nextDeadline
          )
        : "";

    const deadlineMs =
      deadlineAt
        ? Date.parse(deadlineAt)
        : NaN;

    const finalClosed =
      text.includes(
        "最終Ｒ発売終了"
      );

    const isBeforeDeadline =
      !finalClosed &&
      Number.isFinite(deadlineMs) &&
      deadlineMs > nowMs;

    venues.push({
      jcd,

      place:
        decodeHtml(
          venueMatch[2]
        ).trim(),

      eventTitle,
      eventGrade,

      currentRaceNo,
      nextDeadline,
      deadlineAt,

      status: finalClosed
        ? "closed"
        : isBeforeDeadline
          ? "before_deadline"
          : "unknown",

      selectable:
        isBeforeDeadline,

      finalClosed
    });
  });

  return venues;
}

function parseDeadlineTimes(
  raceHtml
) {
  const text =
    stripHtml(raceHtml);

  const match = text.match(
    /締切予定時刻\s+((?:\d{1,2}:\d{2}\s*){1,12})/
  );

  if (!match) return [];

  return (
    match[1].match(
      /\d{1,2}:\d{2}/g
    ) || []
  ).slice(0, 12);
}

function createDeadlineAt(
  date,
  time
) {
  const year =
    date.slice(0, 4);

  const month =
    date.slice(4, 6);

  const day =
    date.slice(6, 8);

  return (
    `${year}-${month}-${day}` +
    `T${time}:00+09:00`
  );
}

async function fetchOfficial(url) {
  const response =
    await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 ChappyBoatRaceAI/1.0"
      },

      signal:
        AbortSignal.timeout(
          15000
        )
    });

  if (!response.ok) {
    throw new Error(
      `公式情報取得失敗: ` +
      `${response.status}`
    );
  }

  return response.text();
}

async function loadVenueSchedule(
  venue,
  date,
  nowMs
) {
  const sourceUrl =
    `${OFFICIAL_BASE}` +
    `/owpc/pc/race/racelist` +
    `?rno=1` +
    `&jcd=${venue.jcd}` +
    `&hd=${date}`;

  try {
    const html =
      await fetchOfficial(
        sourceUrl
      );

    const deadlineTimes =
      parseDeadlineTimes(html);

    const races =
      Array.from(
        { length: 12 },
        (_, index) => {
          const raceNo =
            index + 1;

          const deadline =
            deadlineTimes[index] ||
            "";

          if (!deadline) {
            return {
              raceNo,
              deadline: "",
              deadlineAt: "",
              status: "unknown",
              selectable: false
            };
          }

          const deadlineAt =
            createDeadlineAt(
              date,
              deadline
            );

          const deadlineMs =
            Date.parse(
              deadlineAt
            );

          const isBeforeDeadline =
            Number.isFinite(
              deadlineMs
            ) &&
            deadlineMs > nowMs;

          return {
            raceNo,
            deadline,
            deadlineAt,

            status:
              isBeforeDeadline
                ? "before_deadline"
                : "closed",

            selectable:
              isBeforeDeadline
          };
        }
      );

    return {
      ...venue,
      sourceUrl,
      races,

      remainingRaces:
        races.filter(
          race =>
            race.selectable
        ).length,

      scheduleAvailable:
        deadlineTimes.length ===
        12,

      error: ""
    };
  } catch (error) {
    return {
      ...venue,
      sourceUrl,
      races: [],
      remainingRaces: 0,
      scheduleAvailable: false,

      error:
        error?.message ||
        String(error)
    };
  }
}

module.exports =
  async function handler(
    req,
    res
  ) {
    try {
      const requestedDate =
        String(
          req.query?.date || ""
        );

      const requestedJcd =
        String(
          req.query?.jcd || ""
        );

      const date =
        requestedDate ||
        getJstDateText();

      if (
        !/^\d{8}$/.test(date)
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "dateはYYYYMMDD形式で指定してください"
          });
      }

      if (
        requestedJcd &&
        !/^(0[1-9]|1[0-9]|2[0-4])$/.test(
          requestedJcd
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "jcdは01〜24で指定してください"
          });
      }

      const now =
        new Date();

      const nowMs =
        now.getTime();

      const today =
        getJstDateText(now);

      if (requestedJcd) {
        const selectedVenue =
          await loadVenueSchedule(
            {
              jcd: requestedJcd,

              place:
                PLACE_NAMES[
                  requestedJcd
                ] ||
                requestedJcd
            },

            date,
            nowMs
          );

        const nextRace =
          selectedVenue.races.find(
            race =>
              race.selectable
          ) || null;

        const warnings =
          selectedVenue.error
            ? [{
                jcd:
                  selectedVenue.jcd,

                place:
                  selectedVenue.place,

                error:
                  selectedVenue.error
              }]
            : [];

        res.setHeader(
          "Cache-Control",

          date === today
            ? "s-maxage=30, stale-while-revalidate=30"
            : "s-maxage=3600, stale-while-revalidate=86400"
        );

        return res
          .status(200)
          .json({
            ok: true,

            source:
              "boatrace-official",

            date,
            today,

            isToday:
              date === today,

            checkedAt:
              now.toISOString(),

            venueCount: 1,

            liveVenueCount:
              selectedVenue
                .remainingRaces > 0
                ? 1
                : 0,

            hasUpcomingRace:
              Boolean(nextRace),

            nextRace:
              nextRace
                ? {
                    jcd:
                      selectedVenue.jcd,

                    place:
                      selectedVenue.place,

                    ...nextRace
                  }
                : null,

            venues: [],
            liveVenues: [],
            selectedVenue,
            warnings
          });
      }

      const indexUrl =
        `${OFFICIAL_BASE}` +
        `/owpc/pc/race/index` +
        `?hd=${date}`;

      const indexHtml =
        await fetchOfficial(
          indexUrl
        );

      const venues =
        parseVenues(
          indexHtml,
          date,
          nowMs
        );

      const liveVenues =
        venues.filter(
          venue =>
            venue.selectable
        );

      const nextRace =
        liveVenues
          .map(venue => ({
            jcd: venue.jcd,
            place: venue.place,

            raceNo:
              venue.currentRaceNo,

            deadline:
              venue.nextDeadline,

            deadlineAt:
              venue.deadlineAt,

            status:
              venue.status,

            selectable:
              venue.selectable
          }))
          .sort(
            (a, b) =>
              Date.parse(
                a.deadlineAt
              ) -
              Date.parse(
                b.deadlineAt
              )
          )[0] || null;

      const selectedVenue =
        null;

      const warnings = [];

      res.setHeader(
        "Cache-Control",

        date === today
          ? "s-maxage=30, stale-while-revalidate=30"
          : "s-maxage=3600, stale-while-revalidate=86400"
      );

      return res
        .status(200)
        .json({
          ok: true,

          source:
            "boatrace-official",

          date,
          today,

          isToday:
            date === today,

          checkedAt:
            now.toISOString(),

          indexUrl,

          venueCount:
            venues.length,

          liveVenueCount:
            liveVenues.length,

          hasUpcomingRace:
            Boolean(nextRace),

          nextRace,
          venues,
          liveVenues,
          selectedVenue,
          warnings
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            String(error),

          name:
            error?.name ||
            "Error"
        });
    }
  };