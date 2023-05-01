import * as line from '@line/bot-sdk';
import * as admin from 'firebase-admin';
import * as serviceAccount from '../serviceAccountKey.json';
import * as configJson from '../credentials.json';

// Firebase Admin SDKを初期化する
export const initializedDB = (): any => {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'resortech-6d2a7',
    });
    // Firestore
    return admin.firestore();
}

//LINE初期化
export const initializedLineClient = (config: any): any => {
    return new line.Client(config);
}

// LINE設定値
export const getSettings = () => {
    return {
        channelSecret: configJson.channel_secret,
        channelAccessToken: configJson.channel_access_token
      };
}



/**
 * ユーザーの質問IDを取得する関数
 * @param userid LINEのuserid
 * @return {ans_1: '', ...} 回答オブジェクト
 */
export async function HasUserQuestionId(db: any, userId: string): Promise<any> {
    const docRef = db.collection('users').doc(userId);
    const docSnapshot = await docRef.get();
  
    if (docSnapshot.exists) {
      const data: any = docSnapshot.data();
      return data.question_id;
    } else {
      console.log('User not found in Firestore.');
      return null;
    }
  }


  export async function createCarouselTemplate(db: any, spot_obj: any) {

    // calculateCosineSimilarityのかえりち
    //{ id: '寺泊', cosineSimilarity: 0.9869275424396536 },からidだけを取り出す
    //配列形式
    const spotName: string[] = spot_obj.map((item: { id: string; cosineSimilarity: number }) => item.id);
  
    //[ '寺泊', '国営越後丘稜公園', '長岡花火館' ]の観光地を取り出す
    const spotsData: any[] = [];
    for (const name of spotName) {
      const docRef = db.collection('spots').doc(name);
      const docSnapshot = await docRef.get();
      if (docSnapshot.exists) {
        const spotData = {
          id: docSnapshot.id,
          ...docSnapshot.data()
        };
        spotsData.push(spotData);
      } else {
        console.log(`Spot "${name}" not found in Firestore.`);
      }
    }
  
  
    //カルーセルのテンプレートメッセージを作成して，
    const columns = spotsData.map(spot => {
      console.log("観光地名", spot.id)
      return {
        thumbnailImageUrl: spot.img_url,
        title: spot.id,
        text: spot.outline,
        actions: [
          {
            type: "uri",
            label: "詳細",
            uri: `https://resortech-6d2a7.web.app/?id=${encodeURIComponent(spot.id)}`
          }
        ]
      };
    });
  
    return {
      type: "template",
      altText: "this is a carousel template",
      template: {
        type: "carousel",
        columns: columns
      }
    };
  }

/**
 * 質問を送信する関数
 * @param question_id 質問ID: Number
 * @param replyToken リプライトークン
 * @return replyMessage 
 */
export async function sendQuestion(client: any, db: any, question_id: Number, replyToken: string) {

    //初期値
    let question_text: string = ""
    let question_content: string[] = []
    let question_param: string[] = []
  
    //質問文・質問事項・回答を取得
    const querySnapshot = await db.collection('questions').where("question_id", "==", question_id).get();
    querySnapshot.forEach((doc: any) => {
      const q_obj = doc.data().answers
      question_text = doc.id;
      question_content = Object.keys(q_obj);
      question_param = Object.values(q_obj);
    })
  
  
    const question: any = {
      "type": "flex",
      "altText": question_text,
      "contents": {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "weight": "bold",
              "size": "md",
              "text": question_text,
              "margin": "none",
              "align": "center"
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "button",
              "style": "link",
              "height": "sm",
              "action": {
                "type": "postback",
                "label": question_content[0],
                "data": question_param[0],
                "displayText": question_content[0]
              }
            },
            {
              "type": "button",
              "style": "link",
              "height": "sm",
              "action": {
                "type": "postback",
                "label": question_content[1],
                "data": question_param[1],
                "displayText": question_content[1]
              }
            },
            {
              "type": "button",
              "action": {
                "type": "postback",
                "label": question_content[2],
                "data": question_param[2],
                "displayText": question_content[2]
              }
            },
            {
              "type": "button",
              "action": {
                "type": "postback",
                "label": question_content[3],
                "data": question_param[3],
                "displayText": question_content[3]
              }
            }
          ],
          "flex": 0
        }
      }
    };
  
    return client.replyMessage(replyToken, question);
  }


  
/**
 * ユーザーに出題していない質問IDを取得する関数
 * @param userid LINEのuserid
 * @param min 最小値
 * @param max 最大値 (質問数)
 * @param excluded 配列形式，除外する値
 * @return Number 指定されていない質問ID
 */
export async function getRandomUnaskedQuestion(db: any, userid: any) {

    //usersコレクションのquestion_idを取得する
    const docRef = db.collection('users').doc(userid)
    const docSnapshot = await docRef.get();
    const data: any = docSnapshot.data()
    const User_has_question: any = data.question_id //return { que_1: 0, que_2: 0, que_3: 0}
  
    const min = 1
    const max = 3
    const excluded = Object.values(User_has_question).map(Number);
  
    let randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    while (excluded.includes(randomNum)) {
      randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    return randomNum;
  
  }
  
  /**
   * cos類似度計算
   * @param userid LINEのuserid
   * @return sortedCosineSimilarities オブジェクト
   */
  export async function calculateCosineSimilarity(db: any, userId: string) {
  
    //ansパラメータを取得する
    const docRef = db.collection("users").doc(userId);
    const docSnapshot = await docRef.get();
    const data: any = docSnapshot.data();
    const userAnswers = {
      userId: userId,
      ans_1: Number(data.answer.ans_1),
      ans_2: Number(data.answer.ans_2),
      ans_3: Number(data.answer.ans_3),
    };
  
  
  
    //spotコレクションのドキュメントに含まれるanswerフィールドの値をすべて取得する
    //id 昇順に取得する
    const querySnapshot = await db.collection("spots").get();
    let spot_param: any[] = [];
    querySnapshot.forEach((doc: any) => {
      const param = doc.data().param;
      spot_param.push({ id: doc.id, ans1: param.ans1, ans2: param.ans2, ans3: param.ans3 });
    });
  
  
    //cos類似度計算
    const cosineSimilarities = spot_param.map((spot) => {
      const dotProduct =
        userAnswers.ans_1 * spot.ans1 +
        userAnswers.ans_2 * spot.ans2 +
        userAnswers.ans_3 * spot.ans3;
  
      const userAnswersNorm = Math.sqrt(
        Math.pow(userAnswers.ans_1, 2) +
        Math.pow(userAnswers.ans_2, 2) +
        Math.pow(userAnswers.ans_3, 2)
      );
      const spotNorm = Math.sqrt(
        Math.pow(spot.ans1, 2) + Math.pow(spot.ans2, 2) + Math.pow(spot.ans3, 2)
      );
  
      const cosineSimilarity = dotProduct / (userAnswersNorm * spotNorm);
  
      return { id: spot.id, cosineSimilarity: cosineSimilarity };
    });
  
    // Sort the cosineSimilarities array
    const sortedCosineSimilarities = cosineSimilarities.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
  
  
    return sortedCosineSimilarities
  }
  