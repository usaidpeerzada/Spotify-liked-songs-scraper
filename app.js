const puppeteer = require("puppeteer");
const express = require("express");
const axios = require("axios");
var request = require("request"); // "Request" library
var cors = require("cors");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");
require("dotenv").config();
var client_id = process?.env?.CLIENT_ID;
var client_secret = process?.env?.CLIENT_SECRET;
var redirect_uri = "http://localhost:8888/callback";

/**
 *  paste the following command in your terminal in order to open a browser instance using puppeteer in which you can login.
 * -> /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check --user-data-dir=$(mktemp -d -t 'chrome-remote_data_dir')
 */

// check wsChromeEndpointurl everytime you redo it.

var generateRandomString = function (length) {
  var text = "";
  var possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = "spotify_auth_state";

var app = express();

app
  .use(express.static(__dirname + "/public"))
  .use(cors())
  .use(cookieParser());

app.get("/login", function (req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);
  var scope = "user-read-private user-read-email user-library-read";
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: process?.env?.CLIENT_ID,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      })
  );
});

app.get("/callback", function (req, res) {
  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(
      "/#" +
        querystring.stringify({
          error: "state_mismatch",
        })
    );
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code",
      },
      headers: {
        Authorization:
          "Basic " + Buffer(client_id + ":" + client_secret).toString("base64"),
      },
      json: true,
    };

    request.post(authOptions, async function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token,
          refresh_token = body.refresh_token;
        let songArr = [];
        async function getTracks() {
          let offset = 0;
          let limit = 50;
          let trackUrl = `https://api.spotify.com/v1/me/tracks?offset=${offset}&limit=${limit}`;

          var options = {
            url: trackUrl,
            headers: { Authorization: "Bearer " + access_token },
            json: true,
          };

          await axios
            .get(trackUrl, {
              headers: { Authorization: "Bearer " + access_token },
            })
            .then((res) => (songArr = res.data.items))
            .catch((err) => console.log("err", err));
          //   request.get(options, function (error, response, body) {
          //     return body?.items;
          // for (let i = 0; i < 800; ++i) {
          //   offset = offset + limit;
          //   console.log("ofgf", offset);
          //   if (offset < 500) {
          //     let trackUrl = `https://api.spotify.com/v1/me/tracks?${offset}&${limit}`;
          //     var options = {
          //       url: trackUrl,
          //       headers: { Authorization: "Bearer " + access_token },
          //       json: true,
          //     };
          //     request.get(options, function (error, response, body) {
          //       console.log("body ", body);
          //       songArr.push([...body?.items]);
          //     });
          //   }
          // }
          //   });
        }
        await getTracks();

        // use the access token to access the Spotify Web API
        const songNames = songArr?.map((song) => {
          return {
            name: song?.track?.name,
            artist: song?.track?.artists[0]?.name,
          };
        });
        async function addMusicToYoutube(songarr) {
          const YT_BASE_URL = "https://www.youtube.com";
          console.log("song arr", songarr);

          return new Promise(async (resolve, reject) => {
            try {
              // launch new browser with headless = false to see the browser and maximize the window
              // const browser = await puppeteer.launch({
              //   headless: false,
              //   args: ["--start-maximized"],
              // });
              const wsChromeEndpointurl =
                "ws://127.0.0.1:9222/devtools/browser/127bafa9-17a3-4dec-ad6a-397564522a90";

              const browser = await puppeteer.connect({
                headless: false,
                args: ["--start-maximized"],
                browserWSEndpoint: wsChromeEndpointurl,
              });
              // open new page
              const page = await browser.newPage();
              // assing the windows size
              await page.setViewport({ width: 1280, height: 800 });
              if (songarr) {
                // go to youtube
                await page.goto(YT_BASE_URL, { waitUntil: "networkidle2" });
                await sleep(3000);

                // search and add track to playlist
                for (const songs of songarr) {
                  // text to search
                  let track = `${songs.artist} ${songs.name}`;

                  // wait for the input and clean it
                  await page.waitForSelector("input[name=search_query]");
                  await page.evaluate(
                    () =>
                      (document.querySelector(
                        "input[name=search_query]"
                      ).value = "")
                  );
                  await sleep(3000);

                  // type song and search it
                  await page.type("input[name=search_query]", track, {
                    delay: 50,
                  });
                  await sleep(1000);
                  await page.click("#search-icon-legacy");
                  await page.waitForSelector("#contents");
                  await sleep(3000);

                  // find the menu to add song to list
                  await page.mouse.move(500, 300);
                  await sleep(2000);

                  await page.evaluate(() => {
                    let labels = Array.from(
                      document.querySelectorAll("#label")
                    );
                    labels[1].click();
                  });
                  await page.click(".ytp-miniplayer-expand-watch-page-button");

                  await sleep(2000);
                }

                // await page.close();
                // await browser.close();
                return resolve(songarr);
              } else {
                return reject("Ooops!! Playlist not found");
              }
            } catch (err) {
              console.log("errr", err);
              return reject("error ->", err);
            }
          });
        }
        await addMusicToYoutube(songNames);
        res.redirect(
          "/#" +
            querystring.stringify({
              access_token: access_token,
              refresh_token: refresh_token,
            })
        );
      } else {
        res.redirect(
          "/#" +
            querystring.stringify({
              error: "invalid_token",
            })
        );
      }
    });
  }
});

app.get("/refresh_token", function (req, res) {
  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: "https://accounts.spotify.com/api/token",
    headers: {
      Authorization:
        "Basic " + Buffer(client_id + ":" + client_secret).toString("base64"),
    },
    form: {
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    },
    json: true,
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        access_token: access_token,
      });
    }
  });
});

console.log("Listening on 8888");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
app.listen(8888);
