export class MockAudio {
    static instances = [];

    static reset() {
        MockAudio.instances = [];
    }

    constructor() {
        this.currentTime = 0;
        this.duration = 0;
        this.listeners = {};
        this.play = async () => Promise.resolve();
        this.pause = () => {};
        MockAudio.instances.push(this);
    }

    addEventListener(type, callback) {
        this.listeners[type] = callback;
    }

    removeEventListener(type) {
        delete this.listeners[type];
    }

    emit(type) {
        const handler = this.listeners[type];
        if (handler) {
            handler();
        }
    }
}
