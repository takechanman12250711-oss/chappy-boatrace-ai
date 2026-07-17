/* =========================================================
  チャッピーボートレースAI
  実購入スクショ一括入力
========================================================= */

(function() {
  "use strict";

  const Core =
    window.ChappyPurchaseOcrCore;

  let pendingPurchases = [];

  function formatMoney(value) {
    return `${Math.round(
      Number(value) || 0
    ).toLocaleString("ja-JP")}円`;
  }

  function escapeHtml(value) {
    if (
      window.ChappyUtils &&
      typeof window.ChappyUtils
        .escapeHtml === "function"
    ) {
      return window.ChappyUtils
        .escapeHtml(value);
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message) {
    const area =
      document.getElementById(
        "purchaseScreenshotStatus"
      );

    if (area) {
      area.textContent = message;
    }
  }

  function loadFileToCanvas(file) {
    return new Promise(
      (resolve, reject) => {
        const objectUrl =
          URL.createObjectURL(file);

        const image = new Image();

        image.onload = () => {
          try {
            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width =
              image.naturalWidth;

            canvas.height =
              image.naturalHeight;

            const context =
              canvas.getContext(
                "2d",
                {
                  willReadFrequently:
                    true
                }
              );

            context.drawImage(
              image,
              0,
              0
            );

            resolve(canvas);
          } catch (error) {
            reject(error);
          } finally {
            URL.revokeObjectURL(
              objectUrl
            );
          }
        };

        image.onerror = () => {
          URL.revokeObjectURL(
            objectUrl
          );

          reject(
            new Error(
              "スクショ画像を開けませんでした"
            )
          );
        };

        image.src = objectUrl;
      }
    );
  }

  function buildAmountCanvas(
    sourceCanvas
  ) {
    const sourceX = Math.round(
      sourceCanvas.width * 0.7
    );

    const sourceY = Math.round(
      sourceCanvas.height * 0.1
    );

    const sourceWidth = Math.max(
      1,
      Math.round(
        sourceCanvas.width * 0.3
      )
    );

    const sourceHeight = Math.max(
      1,
      Math.round(
        sourceCanvas.height * 0.82
      )
    );

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context =
      canvas.getContext("2d");

    context.fillStyle = "#ffffff";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    return canvas;
  }

  function readPreviewRows() {
    const preview =
      document.getElementById(
        "purchaseScreenshotPreview"
      );

    if (!preview) return [];

    return Array.from(
      preview.querySelectorAll(
        "tbody tr"
      )
    ).map(row => ({
      ticket:
        Core.normalizeTicket(
          row.querySelector(
            ".purchase-ocr-ticket"
          )?.value
        ),

      amount:
        Number(
          row.querySelector(
            ".purchase-ocr-amount"
          )?.value
        ) || 0
    }));
  }

  function updatePreviewSummary() {
    const rows =
      readPreviewRows();

    const summary =
      document.getElementById(
        "purchaseScreenshotSummary"
      );

    const saveButton =
      document.getElementById(
        "saveScreenshotPurchasesBtn"
      );

    const validTickets =
      rows
        .map(row => row.ticket)
        .filter(Boolean);

    const hasInvalid =
      rows.some(
        row =>
          !row.ticket ||
          row.amount <= 0
      );

    const hasDuplicate =
      new Set(validTickets).size !==
      validTickets.length;

    const total =
      rows.reduce(
        (sum, row) =>
          sum + row.amount,
        0
      );

    if (summary) {
      summary.textContent =
        `${rows.length}点 / ` +
        `合計${formatMoney(total)}` +
        (
          hasInvalid
            ? " / 買い目または購入額を修正してください"
            : hasDuplicate
              ? " / 重複した買い目があります"
              : ""
        );
    }

    if (saveButton) {
      saveButton.disabled =
        rows.length === 0 ||
        hasInvalid ||
        hasDuplicate;
    }

    pendingPurchases = rows;
  }

  function renderPreview(
    duplicateCount
  ) {
    const preview =
      document.getElementById(
        "purchaseScreenshotPreview"
      );

    if (!preview) return;

    if (
      pendingPurchases.length === 0
    ) {
      preview.innerHTML = "";
      updatePreviewSummary();
      return;
    }

    preview.innerHTML = `
      <p
        id="purchaseScreenshotSummary"
        class="v3-note"
      ></p>

      <p class="v3-note">
        ${
          duplicateCount > 0
            ? `${duplicateCount}件の重複を除外しました。`
            : "重複した買い目はありません。"
        }
        保存前に買い目と購入額を確認・修正してください。
      </p>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>買い目</th>
              <th>購入額</th>
              <th>除外</th>
            </tr>
          </thead>

          <tbody>
            ${
              pendingPurchases
                .map(
                  (row, index) => `
                    <tr>
                      <td>
                        <input
                          class="purchase-ocr-ticket"
                          type="text"
                          inputmode="numeric"
                          value="${escapeHtml(
                            row.ticket
                          )}"
                          aria-label="${index + 1}件目の買い目"
                        />
                      </td>

                      <td>
                        <input
                          class="purchase-ocr-amount"
                          type="number"
                          inputmode="numeric"
                          min="100"
                          step="100"
                          value="${Number(
                            row.amount
                          ) || 0}"
                          aria-label="${index + 1}件目の購入額"
                        />
                      </td>

                      <td>
                        <button
                          class="sub-btn"
                          type="button"
                          data-purchase-remove="${index}"
                        >
                          除外
                        </button>
                      </td>
                    </tr>
                  `
                )
                .join("")
            }
          </tbody>
        </table>
      </div>
    `;

    updatePreviewSummary();
  }

  async function
  readPurchaseScreenshots() {
    const input =
      document.getElementById(
        "purchaseScreenshotInput"
      );

    const readButton =
      document.getElementById(
        "readPurchaseScreenshotsBtn"
      );

    const saveButton =
      document.getElementById(
        "saveScreenshotPurchasesBtn"
      );

    const files =
      Array.from(
        input?.files || []
      );

    if (files.length === 0) {
      setStatus(
        "スクショを1枚以上選択してください"
      );

      return;
    }

    if (!Core) {
      setStatus(
        "スクショ解析コアを読み込めませんでした"
      );

      return;
    }

    if (
      !window.Tesseract ||
      typeof window.Tesseract
        .createWorker !== "function"
    ) {
      setStatus(
        "画像読み取り機能を読み込めませんでした。通信状態を確認してください"
      );

      return;
    }

    if (readButton) {
      readButton.disabled = true;
    }

    if (saveButton) {
      saveButton.disabled = true;
    }

    pendingPurchases = [];
    renderPreview(0);

    let worker = null;
    let currentFileNumber = 0;

    try {
      setStatus(
        "画像読み取りを準備しています…"
      );

      worker =
        await window.Tesseract
          .createWorker(
            "eng",
            1,
            {
              logger(message) {
                if (
                  message.status ===
                    "recognizing text" &&
                  Number.isFinite(
                    message.progress
                  )
                ) {
                  setStatus(
                    `${currentFileNumber}/${files.length}枚目を読み取り中…` +
                    `${Math.round(
                      message.progress *
                      100
                    )}%`
                  );
                }
              }
            }
          );

      await worker.setParameters({
        tessedit_pageseg_mode:
          "6",

        tessedit_char_whitelist:
          "0123456789,."
      });

      const rawRows = [];
      const allAmounts = [];

      for (
        let fileIndex = 0;
        fileIndex < files.length;
        fileIndex += 1
      ) {
        currentFileNumber =
          fileIndex + 1;

        setStatus(
          `${currentFileNumber}/${files.length}枚目を解析しています…`
        );

        const sourceCanvas =
          await loadFileToCanvas(
            files[fileIndex]
          );

        const context =
          sourceCanvas.getContext(
            "2d",
            {
              willReadFrequently:
                true
            }
          );

        const imageData =
          context.getImageData(
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height
          );

        const ticketRows =
          Core
            .extractTicketRowsFromPixels(
              imageData.data,
              sourceCanvas.width,
              sourceCanvas.height
            );

        const amountCanvas =
          buildAmountCanvas(
            sourceCanvas
          );

        const recognition =
          await worker.recognize(
            amountCanvas
          );

        const amounts =
          Core.extractAmounts(
            recognition
              ?.data
              ?.text
          );

        allAmounts.push(
          ...amounts
        );

        const imageFallbackAmount =
          Core.mostFrequentAmount(
            amounts
          );

        ticketRows.forEach(
          (row, rowIndex) => {
            rawRows.push({
              ticket:
                row.ticket,

              amount:
                amounts[rowIndex] ||
                imageFallbackAmount ||
                0
            });
          }
        );
      }

      const fallbackAmount =
        Core.mostFrequentAmount(
          allAmounts
        );

      pendingPurchases =
        Core.mergePurchaseRows(
          rawRows,
          fallbackAmount
        );

      const duplicateCount =
        Math.max(
          0,
          rawRows.length -
          pendingPurchases.length
        );

      if (
        pendingPurchases.length === 0
      ) {
        throw new Error(
          "買い目を読み取れませんでした。投票確認の買い目一覧が写ったスクショを選択してください"
        );
      }

      renderPreview(
        duplicateCount
      );

      setStatus(
        `${files.length}枚から${pendingPurchases.length}点を読み取りました`
      );
    } catch (error) {
      console.error(
        "スクショ読み取り失敗",
        error
      );

      pendingPurchases = [];
      renderPreview(0);

      setStatus(
        error?.message ||
        "スクショの読み取りに失敗しました"
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.warn(
            "OCR終了処理に失敗",
            error
          );
        }
      }

      if (readButton) {
        readButton.disabled = false;
      }
    }
  }

  function
  saveScreenshotPurchases() {
    const storage =
      window.ChappyStorage;

    const getRaceParams =
      window
        .ChappyRaceSelection
        ?.getRaceParams;

    const rows =
      readPreviewRows();

    if (
      !storage ||
      typeof storage
        .upsertActualPurchase !==
        "function"
    ) {
      setStatus(
        "実購入の保存機能を取得できません"
      );

      return;
    }

    if (
      typeof getRaceParams !==
      "function"
    ) {
      setStatus(
        "選択中のレース情報を取得できません"
      );

      return;
    }

    const validRows =
      rows.map(row => ({
        ticket:
          Core.normalizeTicket(
            row.ticket
          ),

        amount:
          Number(row.amount) || 0
      }));

    if (
      validRows.length === 0 ||
      validRows.some(
        row =>
          !row.ticket ||
          row.amount <= 0
      ) ||
      new Set(
        validRows.map(
          row => row.ticket
        )
      ).size !== validRows.length
    ) {
      setStatus(
        "買い目・購入額・重複を確認してから保存してください"
      );

      return;
    }

    try {
      const params =
        getRaceParams();

      const raceKey =
        storage.buildRaceKey({
          date:
            params.date,

          jcd:
            params.jcd,

          raceNo:
            params.rno
        });

      if (!raceKey) {
        throw new Error(
          "実購入を保存するレースを特定できません"
        );
      }

      validRows.forEach(row => {
        storage
          .upsertActualPurchase({
            recordType:
              "actual_purchase",

            raceKey,

            date:
              params.date,

            place:
              params.place,

            jcd:
              params.jcd,

            raceNo:
              params.rno,

            ticket:
              row.ticket,

            amount:
              row.amount,

            purchaseOdds:
              0
          });
      });

      const total =
        validRows.reduce(
          (sum, row) =>
            sum + row.amount,
          0
        );

      const input =
        document.getElementById(
          "purchaseScreenshotInput"
        );

      const preview =
        document.getElementById(
          "purchaseScreenshotPreview"
        );

      const saveButton =
        document.getElementById(
          "saveScreenshotPurchasesBtn"
        );

      if (input) {
        input.value = "";
      }

      if (preview) {
        preview.innerHTML = "";
      }

      if (saveButton) {
        saveButton.disabled = true;
      }

      pendingPurchases = [];

      setStatus(
        `${validRows.length}点・合計${formatMoney(total)}を実購入へ保存しました`
      );

      if (
        window.ChappyStats &&
        typeof window
          .ChappyStats
          .renderStats ===
          "function"
      ) {
        window
          .ChappyStats
          .renderStats();
      }
    } catch (error) {
      console.error(
        "スクショ購入保存失敗",
        error
      );

      setStatus(
        error?.message ||
        "スクショの実購入保存に失敗しました"
      );
    }
  }

  function initPurchaseOcr() {
    const input =
      document.getElementById(
        "purchaseScreenshotInput"
      );

    const readButton =
      document.getElementById(
        "readPurchaseScreenshotsBtn"
      );

    const saveButton =
      document.getElementById(
        "saveScreenshotPurchasesBtn"
      );

    const preview =
      document.getElementById(
        "purchaseScreenshotPreview"
      );

    readButton
      ?.addEventListener(
        "click",
        readPurchaseScreenshots
      );

    saveButton
      ?.addEventListener(
        "click",
        saveScreenshotPurchases
      );

    input
      ?.addEventListener(
        "change",
        () => {
          const fileCount =
            input.files
              ?.length || 0;

          pendingPurchases = [];

          if (preview) {
            preview.innerHTML = "";
          }

          if (saveButton) {
            saveButton.disabled =
              true;
          }

          setStatus(
            fileCount > 0
              ? `${fileCount}枚選択しました。「スクショを読み取る」を押してください`
              : "スクショはまだ選択されていません"
          );
        }
      );

    preview
      ?.addEventListener(
        "input",
        updatePreviewSummary
      );

    preview
      ?.addEventListener(
        "click",
        event => {
          const button =
            event.target.closest(
              "[data-purchase-remove]"
            );

          if (!button) return;

          const index =
            Number(
              button
                .dataset
                .purchaseRemove
            );

          pendingPurchases =
            readPreviewRows()
              .filter(
                (
                  row,
                  rowIndex
                ) =>
                  rowIndex !==
                  index
              );

          renderPreview(0);
        }
      );
  }

  window.ChappyPurchaseOcr = {
    readPurchaseScreenshots,
    saveScreenshotPurchases,
    initPurchaseOcr
  };

  document.addEventListener(
    "DOMContentLoaded",
    initPurchaseOcr
  );

})();