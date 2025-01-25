import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import './Info.css';

const Info: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Information</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Information</IonTitle>
          </IonToolbar>
        </IonHeader>
        <div className="container">
          <strong>Document Scanner v0.0.1</strong>
          <p>Application created as an open-source alternative to existing solutions for document scanning, including document detection and image corrections.</p>
          <p>Licence: MIT.</p>
          <p>Repository: https://github.com/Dasc3er/document-scanner.</p>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Info;
