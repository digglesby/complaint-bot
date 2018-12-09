const fetch = require('node-fetch');
const ping = require('ping');
const fs = require('fs');
const twitter = require('twitter');

const tweet_frequency = (1440*60000);
const check_connection_frequency = 60000;
const ip_check = "8.8.8.8";
const results_file = `${__dirname}/results.json`;
const twitter_config = {
  consumer_key: '[TWITTER_CONSUMER_KEY]',
  consumer_secret: '[TWITTER_CONSUMER_SECRET]',
  access_token_key: '[TWITTER_ACCESS_TOKEN_KEY]',
  access_token_secret: '[TWITTER_ACCESS_TOKEN_SECRET]'
};
const downtime_threshold = 1;

let last_tweet = Date.now();
let tweet_buffer = [];

const twitter_client = new twitter(twitter_config);

function create_tweet(){
  /*
  * This function calulcates the up/down time for a period and adds a tweet
  * to the buffer to be sent
  */
  if ( last_tweet <= (Date.now() - tweet_frequency) ){
    fs.readFile( results_file, function (err, file_data) {

      if (err) reject(err);

      let uptime_data = JSON.parse(file_data);
      let success_count = 0;

      if ( uptime_data.hasOwnProperty( last_tweet.toString() ) ){

        for (var i = 0; i < uptime_data[ last_tweet.toString() ].length; i++) {

          success_count = success_count + uptime_data[ last_tweet.toString() ][i];

        }

      } else {
        return;
      }

      let positive_percent = ((success_count/uptime_data[ last_tweet.toString() ].length)*100).toFixed(2);
      let negative_percent = ((1-(success_count/uptime_data[ last_tweet.toString() ].length))*100).toFixed(2);

      if ( negative_percent > downtime_threshold ){
        tweet_buffer.push({ text: `TEST ${negative_percent}% of the time?` });
        //Change this string to change the tweet text
      }

      last_tweet = Date.now();
    });
  }
}

async function send_tweets(){
  /*
  * This function will attempt to post all tweets currently waiting in the
  * buffer, if it fails the tweet will remain in the buffer until successfully
  * posted
  */

  let new_tweet_buffer = [];

  for (var i = 0; i < tweet_buffer.length; i++) {

    await new Promise( (resolve) => {

      twitter_client.post(
        'statuses/update',
        {
          status: tweet_buffer[i].text
        },
        (error = null) => {
          if (error){
            console.error(error);
            new_tweet_buffer.push( tweet_buffer[i] );
          }

          resolve(true);
        }
      );
    });

  }

  tweet_buffer = new_tweet_buffer;

  return true;

}

async function check_connection(){
  /*
  * This function will attempt to ping the IP address sepcified, on success
  * it will return true, on failure; false
  */

  return await new Promise( (resolve) => {
    ping.sys.probe(ip_check, (is_alive) => {
      resolve(is_alive);
    });
  });

}

async function append_result( result ){
  /*
  * This function appends ping results to your results json file
  */

  return await new Promise( (resolve, reject) => {

    fs.readFile( results_file, (err, file_data) => {

      let uptime_data = {};

      if (err){

        if (err.code != 'ENOENT'){
          reject(err);
        }

      } else {

        uptime_data = JSON.parse(file_data);

      }

      let new_uptime_data = Object.assign( uptime_data, {} );

      if ( new_uptime_data.hasOwnProperty( last_tweet.toString() ) ){

        new_uptime_data[ last_tweet.toString() ].push((result) ? 1 : 0 );

      } else {

        new_uptime_data[ last_tweet.toString() ] = [(result) ? 1 : 0];

      }

      fs.writeFile( __dirname + '/results.json', JSON.stringify(new_uptime_data), (err) => {

        if (err) reject(err);
        resolve(true);

      });
    });
  });
}

async function check_loop(){
  let result = await check_connection();
  if (result) send_tweets();

  await append_result( result );
  create_tweet();
}

setInterval( check_loop, check_connection_frequency );
