/* =========================================================
  チャッピーボートレースAI
  実購入スクショ解析コア
========================================================= */

(function () {
  "use strict";

  const SLOT_X_RATIOS = [0.188, 0.277, 0.365];

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];

    if (boats.length !== 3 || new Set(boats).size !== 3) {
      return "";
    }

    return boats.join("-");
  }

  function pixelLane(r, g, b) {
    if (r < 90 && g < 90 && b < 90) return 2;

    if (r > 185 && g < 155 && b < 155 && r > g * 1.25) {
      return 3;
    }

    if (r < 145 && g > 75 && b > 150 && b > r * 1.25) {
      return 4;
    }

    if (r > 185 && g > 150 && b < 135) {
      return 5;
    }

    if (r < 135 && g > 115 && b < 180 && g > r * 1.2) {
      return 6;
    }

    return 0;
  }

  function classifyPatch(
    data,
    width,
    height,
    centerX,
    centerY
  ) {
    const radiusX = Math.max(
      8,
      Math.round(width * 0.018)
    );

    const radiusY = Math.max(
      8,
      Math.round(height * 0.006)
    );

    const stride = Math.max(
      2,
      Math.round(width / 600)
    );

    const counts = [0, 0, 0, 0, 0, 0, 0];
    let total = 0;

    for (
      let y = Math.max(0, centerY - radiusY);
      y <= Math.min(height - 1, centerY + radiusY);
      y += stride
    ) {
      for (
        let x = Math.max(0, centerX - radiusX);
        x <= Math.min(width - 1, centerX + radiusX);
        x += stride
      ) {
        const offset = (y * width + x) * 4;

        const lane = pixelLane(
          data[offset],
          data[offset + 1],
          data[offset + 2]
        );

        if (lane) counts[lane] += 1;
        total += 1;
      }
    }

    let lane = 0;

    for (let boatNo = 2; boatNo <= 6; boatNo += 1) {
      if (counts[boatNo] > counts[lane]) {
        lane = boatNo;
      }
    }

    if (
      !lane ||
      counts[lane] / Math.max(total, 1) < 0.42
    ) {
      return 0;
    }

    return lane;
  }

  function extractTicketRowsFromPixels(
    data,
    width,
    height
  ) {
    const centersX = SLOT_X_RATIOS.map(
      ratio => Math.round(width * ratio)
    );

    const step = Math.max(
      2,
      Math.round(height / 700)
    );

    const activeY = [];

    for (
      let y = Math.round(height * 0.1);
      y < Math.round(height * 0.92);
      y += step
    ) {
      const knownLanes = centersX
        .map(x =>
          classifyPatch(
            data,
            width,
            height,
            x,
            y
          )
        )
        .filter(Boolean);

      if (
        knownLanes.length >= 2 &&
        new Set(knownLanes).size >= 2
      ) {
        activeY.push(y);
      }
    }

    const segments = [];

    activeY.forEach(y => {
      const latest =
        segments[segments.length - 1];

      if (
        !latest ||
        y - latest.end > step * 2
      ) {
        segments.push({
          start: y,
          end: y
        });
      } else {
        latest.end = y;
      }
    });

    const minimumHeight = Math.max(
      12,
      Math.round(height * 0.01)
    );

    return segments
      .filter(
        segment =>
          segment.end - segment.start >=
          minimumHeight
      )
      .map(
        segment =>
          Math.round(
            (segment.start + segment.end) / 2
          )
      )
      .map(y => {
        const lanes = centersX.map(
          x =>
            classifyPatch(
              data,
              width,
              height,
              x,
              y
            ) || 1
        );

        return {
          y,
          ticket: lanes.join("-")
        };
      })
      .filter(
        row => normalizeTicket(row.ticket)
      );
  }

  function extractAmounts(text) {
    const source = String(text || "");

    const commaValues = (
      source.match(
        /[1-9]\d{0,2}(?:[,.]\d{3})+/g
      ) || []
    )
      .map(value =>
        Number(
          value.replace(/[,.]/g, "")
        )
      )
      .filter(
        value =>
          Number.isFinite(value) &&
          value >= 100 &&
          value <= 1000000 &&
          value % 100 === 0
      );

    if (commaValues.length > 0) {
      return commaValues;
    }

    return (
      source.match(
        /\b[1-9]\d{2,5}\b/g
      ) || []
    )
      .map(Number)
      .filter(
        value =>
          Number.isFinite(value) &&
          value >= 100 &&
          value <= 1000000 &&
          value % 100 === 0
      );
  }

  function mostFrequentAmount(values) {
    const counts = new Map();

    values
      .filter(value => value > 0)
      .forEach(value => {
        counts.set(
          value,
          (counts.get(value) || 0) + 1
        );
      });

    return (
      Array.from(counts.entries())
        .sort(
          (a, b) =>
            b[1] - a[1] ||
            a[0] - b[0]
        )[0]?.[0] || 0
    );
  }

  function mergePurchaseRows(
    rows,
    fallbackAmount
  ) {
    const ticketMap = new Map();

    rows.forEach(row => {
      const ticket =
        normalizeTicket(row.ticket);

      if (!ticket) return;

      if (!ticketMap.has(ticket)) {
        ticketMap.set(ticket, []);
      }

      if (Number(row.amount) > 0) {
        ticketMap
          .get(ticket)
          .push(Number(row.amount));
      }
    });

    return Array.from(
      ticketMap.entries()
    )
      .map(([ticket, amounts]) => ({
        ticket,
        amount:
          mostFrequentAmount(amounts) ||
          fallbackAmount ||
          0
      }))
      .sort((a, b) =>
        a.ticket.localeCompare(
          b.ticket,
          "ja",
          { numeric: true }
        )
      );
  }

  window.ChappyPurchaseOcrCore = {
    normalizeTicket,
    extractTicketRowsFromPixels,
    extractAmounts,
    mostFrequentAmount,
    mergePurchaseRows
  };

})();