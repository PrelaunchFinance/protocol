const winston = require("winston");

const { toWei, toBN } = web3.utils;

const { MedianizerPriceFeed } = require("../../src/price-feed/MedianizerPriceFeed");
const { BasketSpreadPriceFeed } = require("../../src/price-feed/BasketSpreadPriceFeed");
const { PriceFeedMock } = require("../../src/price-feed/PriceFeedMock");

contract("BasketSpreadPriceFeed.js", function() {
  let baselinePriceFeeds;
  let experimentalPriceFeeds;
  let denominatorPriceFeed;
  let dummyLogger;
  let basketSpreadPriceFeed;

  beforeEach(async function() {
    dummyLogger = winston.createLogger({
      level: "info",
      transports: [new winston.transports.Console()]
    });
  });
  it("Update", async function() {
    const priceFeeds = [new PriceFeedMock()];
    baselinePriceFeeds = [new MedianizerPriceFeed(priceFeeds), new MedianizerPriceFeed(priceFeeds)];
    experimentalPriceFeeds = [new MedianizerPriceFeed(priceFeeds), new MedianizerPriceFeed(priceFeeds)];
    denominatorPriceFeed = new MedianizerPriceFeed(priceFeeds);

    basketSpreadPriceFeed = new BasketSpreadPriceFeed(
      web3,
      dummyLogger,
      baselinePriceFeeds,
      experimentalPriceFeeds,
      denominatorPriceFeed
    );

    await basketSpreadPriceFeed.update();

    // On the basket spread's update call, `priceFeeds[0]` should have been updated once for each
    // Medianizer price feed that it is incorporated in. This is because the basket spread price feed
    // updates its imported medianizer price feeds.
    // Check work: 2x for baseline update, 2x experimental udpate, 1x for denominator = 5 total.
    assert.equal(priceFeeds[0].updateCalled, 5);
  });
  describe("Computing basket spreads when the spread is within the range [0,2]", function() {
    function _constructPriceFeedsWithPrecision(precision) {
      // First let's construct the constituent pricefeeds of the baskets.
      const baselineFeeds1 = new MedianizerPriceFeed(
        [
          //                currentPrice      historicalPrice    lastUpdatedTime
          new PriceFeedMock(
            toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.2")).div(toBN(10).pow(toBN(18 - precision))),
            200
          ),
          new PriceFeedMock(
            toBN(toWei("1.5")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("1.3")).div(toBN(10).pow(toBN(18 - precision))),
            55000
          ),
          new PriceFeedMock(
            toBN(toWei("9")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("2")).div(toBN(10).pow(toBN(18 - precision))),
            50
          )
        ],
        false
      );
      // Computes the median:
      // current: 1.5
      // historical: 1.3
      const baselineFeeds2 = new MedianizerPriceFeed(
        [
          //                currentPrice      historicalPrice    lastUpdatedTime
          new PriceFeedMock(
            toBN(toWei("1.1")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.6")).div(toBN(10).pow(toBN(18 - precision))),
            200
          ),
          new PriceFeedMock(
            toBN(toWei("2")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.8")).div(toBN(10).pow(toBN(18 - precision))),
            55000
          ),
          new PriceFeedMock(
            toBN(toWei("2.3")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("2.2")).div(toBN(10).pow(toBN(18 - precision))),
            50
          )
        ],
        true
      );
      // Computes the mean:
      // current: 1.8
      // historical: 1.2

      baselinePriceFeeds = [baselineFeeds1, baselineFeeds2];
      // Average basket price:
      // current: 1.65
      // historical: 1.25

      const experimentalFeeds1 = new MedianizerPriceFeed(
        [
          //                currentPrice      historicalPrice    lastUpdatedTime
          new PriceFeedMock(
            toBN(toWei("1.1")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.6")).div(toBN(10).pow(toBN(18 - precision))),
            400
          ),
          new PriceFeedMock(
            toBN(toWei("1.2")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("2")).div(toBN(10).pow(toBN(18 - precision))),
            60000
          ),
          new PriceFeedMock(
            toBN(toWei("1.3")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("66")).div(toBN(10).pow(toBN(18 - precision))),
            100
          )
        ],
        false
      );
      // Computes the median:
      // current: 1.2
      // historical: 2
      const experimentalFeeds2 = new MedianizerPriceFeed(
        [
          //                currentPrice      historicalPrice    lastUpdatedTime
          new PriceFeedMock(
            toBN(toWei("0.9")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.25")).div(toBN(10).pow(toBN(18 - precision))),
            800
          ),
          new PriceFeedMock(
            toBN(toWei("1.3")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("0.75")).div(toBN(10).pow(toBN(18 - precision))),
            650000
          ),
          new PriceFeedMock(
            toBN(toWei("2")).div(toBN(10).pow(toBN(18 - precision))),
            toBN(toWei("2")).div(toBN(10).pow(toBN(18 - precision))),
            200
          )
        ],
        true
      );
      // Computes the mean:
      // current: 1.4
      // historical: 1

      experimentalPriceFeeds = [experimentalFeeds1, experimentalFeeds2];
      // Average basket price:
      // current: 1.3
      // historical: 1.5

      denominatorPriceFeed = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("8")).div(toBN(10).pow(toBN(18 - precision))),
          6
        ),
        new PriceFeedMock(
          toBN(toWei("9")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("12")).div(toBN(10).pow(toBN(18 - precision))),
          7
        )
      ]);
      // Computes the median:
      // current: 5
      // historical: 10
      basketSpreadPriceFeed = new BasketSpreadPriceFeed(
        web3,
        dummyLogger,
        baselinePriceFeeds,
        experimentalPriceFeeds,
        denominatorPriceFeed,
        precision
      );
    }
    it("Default price precision", async function() {
      _constructPriceFeedsWithPrecision(18);

      // Current price calculation:
      // - Basket averaged prices:
      //     - baseline = 1.65
      //     - experimental = 1.3
      // - Spread price: 1 + 1.3 - 1.65 = 0.65
      // - Denominator price: 5
      // ===> Spread price divided by denominator: 0.13
      assert.equal(basketSpreadPriceFeed.getCurrentPrice().toString(), toWei("0.13"));

      // Historical price calculation (because we're using mocks, the timestamp doesn't matter).:
      // - Basket averaged prices:
      //     - baseline = 1.25
      //     - experimental = 1.5
      // - Spread price: 1 + 1.5 - 1.25 = 1.25
      // - Denominator price: 10
      // ===> Spread price divided by denominator: 0.125
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp), toWei("0.125"));

      // Should return the *maximum* lastUpdatedTime.
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 650000);
    });
    it("Custom price precision", async function() {
      // (same calculations and results as previous test, but precision should be different)
      _constructPriceFeedsWithPrecision(8);

      assert.equal(
        basketSpreadPriceFeed.getCurrentPrice().toString(),
        toBN(toWei("0.13"))
          .div(toBN(10).pow(toBN(18 - 8)))
          .toString()
      );
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(
        basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp),
        toBN(toWei("0.125"))
          .div(toBN(10).pow(toBN(18 - 8)))
          .toString()
      );
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 650000);
    });
  });
  describe("Returns floored value when spread is below 0", function() {
    // Basket averaged prices:
    // - baseline = 2.1
    // - experimental = 1
    // Spread price: 1 + 1 - 2.1 = -0.1
    // Denominator price: 5
    // Basket spread divided by denominator = 0

    function _constructPriceFeedsWithPrecision(precision) {
      const baselineFeeds1 = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("2.1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("2.1")).div(toBN(10).pow(toBN(18 - precision))),
          200
        )
      ]);
      baselinePriceFeeds = [baselineFeeds1];
      // Average basket price = 2.1

      const experimentalFeeds1 = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          400
        )
      ]);
      experimentalPriceFeeds = [experimentalFeeds1];
      // Average basket price = 1

      denominatorPriceFeed = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("8")).div(toBN(10).pow(toBN(18 - precision))),
          6
        ),
        new PriceFeedMock(
          toBN(toWei("9")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("12")).div(toBN(10).pow(toBN(18 - precision))),
          7
        )
      ]);
      // Computes the median:
      // current: 5
      // historical: 10
      basketSpreadPriceFeed = new BasketSpreadPriceFeed(
        web3,
        dummyLogger,
        baselinePriceFeeds,
        experimentalPriceFeeds,
        denominatorPriceFeed,
        precision
      );
    }
    it("Default price precision", async function() {
      _constructPriceFeedsWithPrecision(18);

      // Should return 0
      assert.equal(basketSpreadPriceFeed.getCurrentPrice().toString(), "0");

      // Should return 0 for historical price as well (because we're using mocks, the timestamp doesn't matter).
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp), "0");

      // Should return the *maximum* lastUpdatedTime.
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 400);
    });
    it("Custom price precision", async function() {
      _constructPriceFeedsWithPrecision(8);

      // Should return the basket spread price divided by denominator
      assert.equal(basketSpreadPriceFeed.getCurrentPrice().toString(), "0");

      // Should return the same for historical price (because we're using mocks, the timestamp doesn't matter).
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp), "0");

      // Should return the *maximum* lastUpdatedTime.
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 400);
    });
  });
  describe("Returns ceiling value when spread is above 2 0", function() {
    // Basket averaged prices:
    // - baseline = 1
    // - experimental = 2.1
    // Spread price: 1 + 2.1 - 1 = 2.1, which gets ceil'd to 2
    // Denominator price: 5 for current, 10 for historical
    // Basket spread divided by denominator = 0.4 for current, 0.2 for historical

    function _constructPriceFeedsWithPrecision(precision) {
      const baselineFeeds1 = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          200
        )
      ]);
      baselinePriceFeeds = [baselineFeeds1];
      // Average basket price = 1

      const experimentalFeeds1 = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("2.1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("2.1")).div(toBN(10).pow(toBN(18 - precision))),
          400
        )
      ]);
      experimentalPriceFeeds = [experimentalFeeds1];
      // Average basket price = 2.1

      denominatorPriceFeed = new MedianizerPriceFeed([
        //                currentPrice      historicalPrice    lastUpdatedTime
        new PriceFeedMock(
          toBN(toWei("1")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("8")).div(toBN(10).pow(toBN(18 - precision))),
          6
        ),
        new PriceFeedMock(
          toBN(toWei("9")).div(toBN(10).pow(toBN(18 - precision))),
          toBN(toWei("12")).div(toBN(10).pow(toBN(18 - precision))),
          7
        )
      ]); // Computes the median: 5
      basketSpreadPriceFeed = new BasketSpreadPriceFeed(
        web3,
        dummyLogger,
        baselinePriceFeeds,
        experimentalPriceFeeds,
        denominatorPriceFeed,
        precision
      );
    }
    it("Default price precision", async function() {
      _constructPriceFeedsWithPrecision(18);

      // Should return 0.4
      assert.equal(basketSpreadPriceFeed.getCurrentPrice().toString(), toWei("0.4"));

      // Should return the same for historical price (because we're using mocks, the timestamp doesn't matter).
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp), toWei("0.2"));

      // Should return the *maximum* lastUpdatedTime.
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 400);
    });
    it("Custom price precision", async function() {
      _constructPriceFeedsWithPrecision(8);

      // Should return 0.4 in desired precision
      assert.equal(
        basketSpreadPriceFeed.getCurrentPrice().toString(),
        toBN(toWei("0.4"))
          .div(toBN(10).pow(toBN(18 - 8)))
          .toString()
      );

      // Should return a historical price that is adjusted for the historical denominator price
      // (because we're using mocks, the timestamp doesn't matter).
      const arbitraryHistoricalTimestamp = 1000;
      assert.equal(
        basketSpreadPriceFeed.getHistoricalPrice(arbitraryHistoricalTimestamp),
        toBN(toWei("0.2"))
          .div(toBN(10).pow(toBN(18 - 8)))
          .toString()
      );

      // Should return the *maximum* lastUpdatedTime.
      assert.equal(basketSpreadPriceFeed.getLastUpdateTime(), 400);
    });
  });
});
