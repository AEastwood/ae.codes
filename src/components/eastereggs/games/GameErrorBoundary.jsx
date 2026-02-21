import { Component } from 'react';
import PropTypes from 'prop-types';

export default class GameErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error('Game crashed:', error);
    }

    handleReset = () => {
        this.setState({ hasError: false });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center text-white bg-black/80 rounded-lg">
                    <h2 className="text-2xl font-bold mb-2">Game crashed</h2>
                    <p className="mb-4">Something went wrong while running this game.</p>
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                    >
                        Reload Game
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

GameErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired
};
