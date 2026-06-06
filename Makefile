.PHONY: serve

serve:
	GOOGLE_CLOUD_REGION=us-central1 node --watch planning-server.js
