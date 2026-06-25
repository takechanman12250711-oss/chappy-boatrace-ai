// api/stats.js v1

module.exports = async (req, res) => {

  const stats = {
    total: {
      predictions: 0,
      hits: 0,
      hitRate: 0,
      recoveryRate: 0,
      honmeiHitRate: 0,
      manshuHitRate: 0
    },

    venues: [
      { name:"桐生", hitRate:0, recoveryRate:0 },
      { name:"戸田", hitRate:0, recoveryRate:0 },
      { name:"江戸川", hitRate:0, recoveryRate:0 },
      { name:"平和島", hitRate:0, recoveryRate:0 },
      { name:"多摩川", hitRate:0, recoveryRate:0 },
      { name:"浜名湖", hitRate:0, recoveryRate:0 },
      { name:"蒲郡", hitRate:0, recoveryRate:0 },
      { name:"常滑", hitRate:0, recoveryRate:0 },
      { name:"津", hitRate:0, recoveryRate:0 },
      { name:"三国", hitRate:0, recoveryRate:0 },
      { name:"びわこ", hitRate:0, recoveryRate:0 },
      { name:"住之江", hitRate:0, recoveryRate:0 },
      { name:"尼崎", hitRate:0, recoveryRate:0 },
      { name:"鳴門", hitRate:0, recoveryRate:0 },
      { name:"丸亀", hitRate:0, recoveryRate:0 },
      { name:"児島", hitRate:0, recoveryRate:0 },
      { name:"宮島", hitRate:0, recoveryRate:0 },
      { name:"徳山", hitRate:0, recoveryRate:0 },
      { name:"下関", hitRate:0, recoveryRate:0 },
      { name:"若松", hitRate:0, recoveryRate:0 },
      { name:"芦屋", hitRate:0, recoveryRate:0 },
      { name:"福岡", hitRate:0, recoveryRate:0 },
      { name:"唐津", hitRate:0, recoveryRate:0 },
      { name:"大村", hitRate:0, recoveryRate:0 }
    ]
  };

  res.status(200).json(stats);

};
