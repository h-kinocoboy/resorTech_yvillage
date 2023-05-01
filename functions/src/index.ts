import * as functions from 'firebase-functions';
import * as express from 'express';
import * as line from '@line/bot-sdk';
import { getSettings, initializedDB, initializedLineClient, HasUserQuestionId, createCarouselTemplate, calculateCosineSimilarity, sendQuestion, getRandomUnaskedQuestion } from './common';


// DBの初期化
const db = initializedDB();

// 環境値の取得
const config = getSettings();

// Line クライアントの初期化
const client = initializedLineClient(config)


const app = express();


//非同期処理
app.post('/', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

//イベント処理
async function handleEvent(event: line.WebhookEvent): Promise<any> {
  if (event.type === "message" && event.message.type === "text" && event.message.text === "観光スポットを見つける") {
    const getUserId: any = event.source.userId
    const replyToken: any = event.replyToken

    //answerフィールドを取得
    // let ans_field =await getUserAnswer(getUserId)

    //userid 初期化
    await db.collection('users').doc(getUserId).set({ answer: { ans_1: 0, ans_2: 0, ans_3: 0 }, question_id: { que_1: 0, que_2: 0, que_3: 0 } });

    //質問IDをusesテーブルへ
    let getQuestionId = await getRandomUnaskedQuestion(db, getUserId)
    let docRef: any = db.collection('users').doc(getUserId)
    docRef.update({
      question_id: {
        que_1: Number(getQuestionId)
      }
    });
    //メッセージを送信
    return sendQuestion(client, db, getQuestionId, replyToken)
  }
  else if (event.type === "postback") {
    //userid取得
    const getUserId: any = event.source.userId;
    const replyToken: any = event.replyToken;
    const que_field = await HasUserQuestionId(db, getUserId);


    //3つ目の質問
    if (que_field.que_1 && que_field.que_2 && que_field.que_3) {
      //回答をusersテーブルへ
      const docRef: any = db.collection('users').doc(getUserId);
      //現在のデータを取得し、回答と次の質問IDを一度に更新
      const userData = (await docRef.get()).data();
      const updatedAnswer = { ...userData.answer, ans_3: Number(event.postback.data) };
      await docRef.update({
        answer: updatedAnswer,
      });

      //Todo ここにcos類似関数を入れる
      const cosRuiji_result = await calculateCosineSimilarity(db, getUserId)
      const carouselTemplate: any = await createCarouselTemplate(db, cosRuiji_result);

      // console.log(carouselTemplate)

      return client.replyMessage(event.replyToken, carouselTemplate);
    }

    //2つ目の質問
    if (que_field.que_2) {
      //回答をusersテーブルへ
      const docRef: any = db.collection('users').doc(getUserId);
      //次の質問を送信する
      const getQuestionId = await getRandomUnaskedQuestion(db, getUserId);
      //現在のデータを取得し、回答と次の質問IDを一度に更新
      const userData = (await docRef.get()).data();
      const updatedAnswer = { ...userData.answer, ans_2: Number(event.postback.data) };
      const updatedQuestionId = { ...userData.question_id, que_3: Number(getQuestionId) };
      await docRef.update({
        answer: updatedAnswer,
        question_id: updatedQuestionId
      });
      //質問を送信(2つめの質問)
      return sendQuestion(client, db, getQuestionId, replyToken);
    }

    //1つ目の質問
    if (que_field.que_1) {

      //userテーブル参照
      const docRef: any = db.collection('users').doc(getUserId);
      //次の質問を送信する
      const getQuestionId = await getRandomUnaskedQuestion(db, getUserId);
      //現在のデータを取得し、回答と次の質問IDを一度に更新
      const userData = (await docRef.get()).data();
      const updatedQuestionId = { ...userData.question_id, que_2: Number(getQuestionId) };
      await docRef.update({
        answer: {
          ans_1: Number(event.postback.data)
        },
        question_id: updatedQuestionId
      });
      //質問を送信(2つめの質問)
      return sendQuestion(client, db, getQuestionId, replyToken);
    }

  }

  return Promise.resolve(null);
}
export const lineBot = functions.https.onRequest(app);
