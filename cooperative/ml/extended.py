"""
CoopSys Extended Machine Learning Module
=========================================
Extends the loan-default Random Forest (predictor.py) with three more
models sharing the same feature-engineering/train/serialize pattern:

  1. Contribution shortfall forecasting — RandomForestClassifier predicting
     whether a member is likely to miss/underpay their next contribution.
  2. Anomalous transaction detection — IsolationForest fit directly on real
     Transaction amounts (unsupervised; no synthetic labels needed since
     it only needs to learn what "normal" looks like from real data).
  3. Member attrition estimation — RandomForestClassifier predicting
     whether a member is likely to go inactive.

Shortfall/attrition are trained on synthetic data (same reasoning as
predictor.py: there's no real historical "did this member eventually
default/attrite" ground truth to train on yet), but PREDICTIONS are always
computed from each member's real Contribution/Savings/Transaction history.
Anomaly detection has no synthetic step at all — it's fit fresh on
whatever real transactions exist.
"""
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / 'models'
MODELS_DIR.mkdir(exist_ok=True)

SHORTFALL_MODEL_PATH = MODELS_DIR / 'shortfall_model.joblib'
SHORTFALL_SCALER_PATH = MODELS_DIR / 'shortfall_scaler.joblib'
SHORTFALL_METRICS_PATH = MODELS_DIR / 'shortfall_metrics.joblib'

ATTRITION_MODEL_PATH = MODELS_DIR / 'attrition_model.joblib'
ATTRITION_SCALER_PATH = MODELS_DIR / 'attrition_scaler.joblib'
ATTRITION_METRICS_PATH = MODELS_DIR / 'attrition_metrics.joblib'

SHORTFALL_FEATURES = [
    'contribution_consistency', 'months_as_member', 'monthly_income',
    'savings_balance', 'recent_missed_streak',
]
ATTRITION_FEATURES = [
    'months_as_member', 'contribution_consistency', 'savings_balance',
    'days_since_last_activity', 'savings_trend',
]


# ─── SYNTHETIC TRAINING DATA ──────────────────────────────────────────────────

def _generate_shortfall_data(n_samples=1000):
    np.random.seed(7)
    n_ok, n_risk = n_samples // 2, n_samples - n_samples // 2
    ok = {
        'contribution_consistency': np.random.uniform(0.75, 1.0, n_ok),
        'months_as_member': np.random.randint(6, 72, n_ok),
        'monthly_income': np.random.uniform(60000, 400000, n_ok),
        'savings_balance': np.random.uniform(50000, 900000, n_ok),
        'recent_missed_streak': np.random.choice([0, 1], n_ok, p=[0.9, 0.1]),
        'shortfall': np.zeros(n_ok, dtype=int),
    }
    risk = {
        'contribution_consistency': np.random.uniform(0.15, 0.65, n_risk),
        'months_as_member': np.random.randint(1, 36, n_risk),
        'monthly_income': np.random.uniform(15000, 90000, n_risk),
        'savings_balance': np.random.uniform(2000, 60000, n_risk),
        'recent_missed_streak': np.random.choice([1, 2, 3, 4], n_risk, p=[0.35, 0.3, 0.2, 0.15]),
        'shortfall': np.ones(n_risk, dtype=int),
    }
    data = pd.concat([pd.DataFrame(ok), pd.DataFrame(risk)], ignore_index=True)
    return data.sample(frac=1, random_state=7).reset_index(drop=True)


def _generate_attrition_data(n_samples=1000):
    np.random.seed(11)
    n_stay, n_leave = n_samples // 2, n_samples - n_samples // 2
    stay = {
        'months_as_member': np.random.randint(6, 96, n_stay),
        'contribution_consistency': np.random.uniform(0.7, 1.0, n_stay),
        'savings_balance': np.random.uniform(40000, 900000, n_stay),
        'days_since_last_activity': np.random.uniform(0, 30, n_stay),
        'savings_trend': np.random.uniform(0.0, 0.3, n_stay),
        'attrited': np.zeros(n_stay, dtype=int),
    }
    leave = {
        'months_as_member': np.random.randint(1, 48, n_leave),
        'contribution_consistency': np.random.uniform(0.0, 0.5, n_leave),
        'savings_balance': np.random.uniform(0, 50000, n_leave),
        'days_since_last_activity': np.random.uniform(45, 240, n_leave),
        'savings_trend': np.random.uniform(-0.5, 0.05, n_leave),
        'attrited': np.ones(n_leave, dtype=int),
    }
    data = pd.concat([pd.DataFrame(stay), pd.DataFrame(leave)], ignore_index=True)
    return data.sample(frac=1, random_state=11).reset_index(drop=True)


# ─── TRAINING ──────────────────────────────────────────────────────────────

def _train_classifier(data, feature_names, label_col, model_path, scaler_path, metrics_path):
    X, y = data[feature_names], data[label_col]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    clf = RandomForestClassifier(
        n_estimators=120, max_depth=8, min_samples_split=5,
        class_weight='balanced', random_state=42, n_jobs=-1,
    )
    clf.fit(X_train_s, y_train)
    preds = clf.predict(X_test_s)
    cv = cross_val_score(clf, X_train_s, y_train, cv=5, scoring='accuracy')

    metrics = {
        'accuracy': round(accuracy_score(y_test, preds) * 100, 2),
        'precision': round(precision_score(y_test, preds) * 100, 2),
        'recall': round(recall_score(y_test, preds) * 100, 2),
        'f1_score': round(f1_score(y_test, preds) * 100, 2),
        'cv_mean': round(cv.mean() * 100, 2),
        'feature_importances': dict(zip(feature_names, clf.feature_importances_.tolist())),
        'trained_at': datetime.now().isoformat(),
        'n_samples': len(data),
    }
    joblib.dump(clf, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(metrics, metrics_path)
    return metrics


def train_shortfall_model(n_samples=1000):
    return _train_classifier(
        _generate_shortfall_data(n_samples), SHORTFALL_FEATURES, 'shortfall',
        SHORTFALL_MODEL_PATH, SHORTFALL_SCALER_PATH, SHORTFALL_METRICS_PATH,
    )


def train_attrition_model(n_samples=1000):
    return _train_classifier(
        _generate_attrition_data(n_samples), ATTRITION_FEATURES, 'attrited',
        ATTRITION_MODEL_PATH, ATTRITION_SCALER_PATH, ATTRITION_METRICS_PATH,
    )


def train_extended_models(n_samples=1000):
    return {
        'shortfall': train_shortfall_model(n_samples),
        'attrition': train_attrition_model(n_samples),
    }


def is_extended_trained():
    return SHORTFALL_MODEL_PATH.exists() and ATTRITION_MODEL_PATH.exists()


def get_shortfall_metrics():
    if not SHORTFALL_METRICS_PATH.exists():
        return train_shortfall_model()
    return joblib.load(SHORTFALL_METRICS_PATH)


def get_attrition_metrics():
    if not ATTRITION_METRICS_PATH.exists():
        return train_attrition_model()
    return joblib.load(ATTRITION_METRICS_PATH)


# ─── PREDICTION ──────────────────────────────────────────────────────────────

def _predict(features, feature_names, model_path, scaler_path, train_fn):
    if not model_path.exists():
        train_fn()
    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    vector = [float(features.get(f, 0)) for f in feature_names]
    X = scaler.transform(np.array(vector).reshape(1, -1))
    proba = model.predict_proba(X)[0]
    positive_proba = float(proba[1]) if len(proba) > 1 else float(proba[0])
    return positive_proba


def predict_contribution_shortfall(features: dict) -> dict:
    """features: contribution_consistency, months_as_member, monthly_income,
    savings_balance, recent_missed_streak (real, computed from a member)."""
    p = _predict(features, SHORTFALL_FEATURES, SHORTFALL_MODEL_PATH,
                 SHORTFALL_SCALER_PATH, train_shortfall_model)
    level = 'High' if p >= 0.66 else 'Medium' if p >= 0.33 else 'Low'
    return {
        'shortfall_probability': round(p * 100, 1),
        'risk_level': level,
        'recommendation': (
            "Likely to miss the next contribution — consider a reminder or a "
            "flexible payment plan." if level != 'Low'
            else "Contribution pattern is healthy; no action needed."
        ),
    }


def predict_attrition_risk(features: dict) -> dict:
    """features: months_as_member, contribution_consistency, savings_balance,
    days_since_last_activity, savings_trend (real, computed from a member)."""
    p = _predict(features, ATTRITION_FEATURES, ATTRITION_MODEL_PATH,
                 ATTRITION_SCALER_PATH, train_attrition_model)
    level = 'High' if p >= 0.66 else 'Medium' if p >= 0.33 else 'Low'
    return {
        'attrition_probability': round(p * 100, 1),
        'risk_level': level,
        'recommendation': (
            "Member shows signs of disengagement — an officer follow-up is "
            "recommended." if level != 'Low'
            else "Member is actively engaged; no action needed."
        ),
    }


# ─── ANOMALY DETECTION (unsupervised, on real data) ─────────────────────────

def detect_anomalous_transactions(transactions, contamination=0.08):
    """
    transactions: iterable of real Transaction model instances.
    Fits an IsolationForest per member (so a large member isn't just
    flagged for being large) on log-scaled amounts, since cooperative
    transaction sizes vary hugely by member. Returns the flagged ones
    sorted by how anomalous they are.
    """
    by_member = {}
    for t in transactions:
        by_member.setdefault(t.member_id, []).append(t)

    flagged = []
    for member_id, txns in by_member.items():
        if len(txns) < 5:
            continue  # not enough history to judge what's "normal" for this member
        amounts = np.array([[np.log1p(float(t.amount))] for t in txns])
        clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
        clf.fit(amounts)
        scores = clf.decision_function(amounts)
        preds = clf.predict(amounts)
        for t, score, pred in zip(txns, scores, preds):
            if pred == -1:
                flagged.append((t, float(score)))

    flagged.sort(key=lambda pair: pair[1])
    return flagged
