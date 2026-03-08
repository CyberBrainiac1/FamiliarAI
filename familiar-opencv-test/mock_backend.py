from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/recognition-event", methods=["POST"])
def recognition_event():
    data = request.get_json()
    print("Got payload keys:", list(data.keys()))

    embedding = data.get("embedding", [])

    if embedding and embedding[0] > 100:
        return jsonify({
            "status": "recognized",
            "interactionId": "test-interaction-123",
            "person": {
                "id": "person-1",
                "name": "John Doe",
                "relationship": "Neighbor"
            },
            "confidence": 0.91,
            "spokenText": "This is John, your neighbor.",
            "summary": "Recognized John Doe as a familiar visitor."
        })
    else:
        return jsonify({
            "status": "unknown",
            "interactionId": "test-interaction-456",
            "alertId": "alert-1"
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)