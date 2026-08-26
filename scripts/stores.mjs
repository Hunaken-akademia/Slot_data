import path from "node:path";

export const STORES = {
  akasaka: {
    slug: "akasaka",
    name: "エスパス日拓 赤坂見附駅前店",
    shortName: "赤坂見附",
    tagUrl: "https://min-repo.com/tag/%E3%82%A8%E3%82%B9%E3%83%91%E3%82%B9%E6%97%A5%E6%8B%93%E8%B5%A4%E5%9D%82%E8%A6%8B%E9%99%84%E9%A7%85%E5%89%8D%E6%96%B0%E9%A4%A8/",
    dataDir: "public/data",
    publicPath: "data",
    minRows: 250,
    maxRows: 350
  },
  "mitoya-suidobashi": {
    slug: "mitoya-suidobashi",
    name: "みとや水道橋",
    shortName: "みとや水道橋",
    tagUrl: "https://min-repo.com/tag/%E3%81%BF%E3%81%A8%E3%82%84%E6%B0%B4%E9%81%93%E6%A9%8B/",
    dataDir: "public/data/stores/mitoya-suidobashi",
    publicPath: "data/stores/mitoya-suidobashi",
    minRows: 280,
    maxRows: 380
  },
  inage: {
    slug: "inage",
    name: "エスパス日拓 稲毛駅前新館",
    shortName: "エスパス稲毛",
    tagUrl: "https://min-repo.com/tag/%E3%82%A8%E3%82%B9%E3%83%91%E3%82%B9%E6%97%A5%E6%8B%93%E7%A8%B2%E6%AF%9B%E9%A7%85%E5%89%8D%E6%96%B0%E9%A4%A8/",
    dataDir: "public/data/stores/inage",
    publicPath: "data/stores/inage",
    minRows: 150,
    maxRows: 260
  },
  "yasuda-shimizucho": {
    slug: "yasuda-shimizucho",
    name: "やすだ清水町店",
    shortName: "やすだ清水町",
    tagUrl: "https://min-repo.com/tag/%e3%82%84%e3%81%99%e3%81%a0%e6%b8%85%e6%b0%b4%e7%94%ba%e5%ba%97/",
    dataDir: "public/data/stores/yasuda-shimizucho",
    publicPath: "data/stores/yasuda-shimizucho",
    minRows: 100,
    maxRows: 150
  }
};

export function selectedStore() {
  const slug = process.env.STORE_SLUG || "akasaka";
  const store = STORES[slug];
  if (!store) throw new Error(`Unknown STORE_SLUG: ${slug}`);
  return { ...store, absoluteDataDir: path.resolve(store.dataDir) };
}
