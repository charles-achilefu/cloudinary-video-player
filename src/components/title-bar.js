import videojs from 'video.js';
import 'assets/styles/components/title-bar.scss';
import componentUtils from './component-utils';

// support VJS5 & VJS6 at the same time
const dom = videojs.dom || videojs;

const Component = videojs.getComponent('Component');

class TitleBar extends Component {
  constructor(player, options = {}) {
    super(player, options);

    this.on(player, 'cldsourcechanged', (_, { source }) => this.setItem(source));

    this.setItem = (source) => {
      const info = source.info();

      this.setTitle(info.title);
      this.setSubtitle(info.subtitle);
    };

    this.setTitle = (text) => {
      componentUtils.setText(this.titleEl, text);
      refresh();
      return text;
    };

    this.setSubtitle = (text) => {
      componentUtils.setText(this.subtitleEl, text);
      refresh();
      return text;
    };

    const titleValue = () => this.titleEl.innerText;
    const subtitleValue = () => this.subtitleEl.innerText;

    const refresh = () => {
      if (!titleValue() && !subtitleValue()) {
        this.hide();
        return;
      }

      // if (subtitleValue().length <= 0) {
        // componentUtils.show(this.spacerEl)
        // this.spacerEl.style.display = 'none';
      // } else {
        // this.spacerEl.style.display = 'block';
      // }

      this.show();
    };
  }

  createEl() {
    this.titleEl = dom.createEl('div', {
      className: 'vjs-title-bar-title'
    });

    this.subtitleEl = dom.createEl('div', {
      className: 'vjs-title-bar-subtitle'
    });

    // this.spacerEl = dom.createEl('div', {
      // className: 'vjs-title-bar-spacer'
    // });

    const el = super.createEl('div', {
      append: this.titleEl,
      className: 'vjs-title-bar'
    });

    el.appendChild(this.titleEl);
    // el.appendChild(this.spacerEl);
    el.appendChild(this.subtitleEl);

    return el;
  }
}

videojs.registerComponent('titleBar', TitleBar);

export default TitleBar;
