
const dataForge = require('data-forge');
require('data-forge-fs'); // For loading files.
require('data-forge-indicators'); // For the moving average indicator.
const { plot } = require('plot');
require('@plotex/render-image')
const { backtest, analyze, computeEquityCurve, computeDrawdown } = require('grademark');
var Table = require('easy-table');
const fs = require('fs');
const moment = require('moment');

async function main() {

    console.log("Loading and preparing data.");

    let inputSeries = dataForge.readFileSync("data/ETH-USD.csv")
        .parseCSV()
        .parseDates("date", "YYYY-MM-D")
        .parseFloats(["open", "high", "low", "close", "volume"])
        .setIndex("date") // Index so we can later merge on date.
        .renameSeries({ date: "time" });

    const rangeVal = 180;

    // The example data file is available in the 'data' sub-directory of this repo.

    console.log("Computing moving average indicator.");

    // Add whatever indicators and signals you want to your data.
    const movingAverage = inputSeries
        .deflate(bar => bar.close)          // Extract closing price series.
        .sma(50)
        .bake();                           // 30 day moving average.

    const exMovingAverage = inputSeries
        .deflate(bar => bar.close)
        .ema(9)
        .bake();

    inputSeries = inputSeries
        .withSeries("sma5",exMovingAverage)   // Integrate moving average into data, indexed on date.
        .withSeries("sma20",movingAverage)
        .skip(50)
        .bake();                           // Skip blank sma entries.

    const rsi = inputSeries
    .deflate(y => y.close)
    .rsi(14)
    .bake();

    inputSeries = inputSeries
    .withSeries("rsi", rsi)
    .skip(14)
    .bake();

    // testseries
    // .asCSV()
    // .writeFileSync("dataWithRSI.csv");

    inputSeries
    .asCSV()
    .writeFileSync("updatedData.csv");

    let test = inputSeries.deflate(row => row.close);
    let test1 = inputSeries.deflate(row => row.sma5);
    let test2 = inputSeries.deflate(row => row.sma20);

    const data = {
     A: test.toArray(),
     B: test1.toArray(),
     C: test2.toArray()
};
console.log(data);
plot(data)
     .renderImage("./myplot.png"); // Need &commat;plotex/render-image installed for this.


    // This is a very simple and very naive mean reversion strategy:
    let enterPrice = 0;
    const strategy = {
        entryRule: (enterPosition, args) => {
            if (args.bar.sma5 < args.bar.sma20 && args.bar.rsi < "30") { // Buy when price is below average.
                enterPrice = args.bar.close;
                console.log(enterPrice);
                enterPosition();
            }
        },

        exitRule: (exitPosition, args) => {
            if (args.bar.sma5 > args.bar.sma20 && args.bar.rsi > "70" && enterPrice < args.bar.close) {
                enterPrice = 0;
                exitPosition(); // Sell when price is above average.
            }
        },

        stopLoss: args => { // Intrabar stop loss.
            // return args.entryPrice * (5/100); // Stop out on 5% loss from entry price.
        },
    };

    console.log("Backtesting...");

    //Set the backtest range
    const range = inputSeries.tail(rangeVal);

    // Backtest your strategy, then compute and print metrics:
    const trades = backtest(strategy, range);
    console.log("The backtest conducted " + trades.length + " trades!");

    new dataForge.DataFrame(trades)
        .transformSeries({
            entryTime: d => moment(d).format("YYYY/MM/DD"),
            exitTime: d => moment(d).format("YYYY/MM/DD"),
        })
        .asCSV()
        .writeFileSync("./output/trades.csv");

    console.log("Analyzing...");

    const startingCapital = 10000;
    const analysis = analyze(startingCapital, trades);

    const analysisTable = new Table();

    for (const key of Object.keys(analysis)) {
        analysisTable.cell("Metric", key);
        analysisTable.cell("Value", analysis[key]);
        analysisTable.newRow();
    }

    const analysisOutput = analysisTable.toString();
    console.log(analysisOutput);
    const analysisOutputFilePath = "output/analysis.txt";
    fs.writeFileSync(analysisOutputFilePath, analysisOutput);
    console.log(">> " + analysisOutputFilePath);

    console.log("Plotting...");
    // Visualize RSI Data
    await plot(range.toArray(),{chartType: "line"},{y:"close"}).renderImage("output/original.png");
    console.log(">> " + "output/original.png");
    // Visualize RSI Data
    await plot(range.toArray(),{chartType: "line"},{y:"rsi"}).renderImage("output/RSI.png");
    console.log(">> " + "output/RSI.png");
    // Visualize the equity curve and drawdown chart for your backtest:
    const equityCurve = computeEquityCurve(startingCapital, trades);
    const equityCurveOutputFilePath = "output/my-equity-curve.png";
    await plot(equityCurve, { chartType: "line", y: { label: "Equity $" }})
        .renderImage(equityCurveOutputFilePath);
    console.log(">> " + equityCurveOutputFilePath);

    const equityCurvePctOutputFilePath = "output/my-equity-curve-pct.png";
    const equityPct = equityCurve.map(v => ((v - startingCapital) / startingCapital) * 100);
    await plot(equityPct, { chartType: "line", y: { label: "Equity %" }})
        .renderImage(equityCurvePctOutputFilePath);
    console.log(">> " + equityCurvePctOutputFilePath);

    const drawdown = computeDrawdown(startingCapital, trades);
    const drawdownOutputFilePath = "output/my-drawdown.png";
    await plot(drawdown, { chartType: "line", y: { label: "Drawdown $" }})
        .renderImage(drawdownOutputFilePath);
    console.log(">> " + drawdownOutputFilePath);

    const drawdownPctOutputFilePath = "output/my-drawdown-pct.png";
    const drawdownPct = drawdown.map(v => (v / startingCapital) * 100);
    await plot(drawdownPct, { chartType: "line", y: { label: "Drawdown %" }})
        .renderImage(drawdownPctOutputFilePath);
    console.log(">> " + drawdownPctOutputFilePath);
};

main()
    .then(() => console.log("Finished"))
    .catch(err => {
        console.error("An error occurred.");
        console.error(err && err.stack || err);
    });
