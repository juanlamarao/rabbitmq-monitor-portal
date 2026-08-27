from rq import Worker

from app.core.logging import logger
from app.jobs.queue import default_queue


def main():
    logger.info("RabbitMQ Monitor Worker iniciado e aguardando jobs RQ.")
    worker = Worker([default_queue], connection=default_queue.connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
